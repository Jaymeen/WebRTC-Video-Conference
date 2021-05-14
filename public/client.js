let socket;
let clientName;
let localStreams = [];
let instances = 0;
let peerConnections = {};
let roomId;
let clientId;

let audioMuted = [];
let videoMuted = [];

const mediaConstraints = {
    audio: {
        echoCancellation: true
    },
    video: {
        width: {
            max: 1920,
            min: 426
        },
        height: {
            max: 1080,
            min: 240
        }
    }
};

const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ],
};

async function createRoom() {
    toggleButtonDisability(true);
    setupSocket();
    clientName = document.getElementById('clientname-text').value;

    let responseData = await fetch('/createRoom', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        }
    }).then(response => {
        if(response.status === 200) {
            return response.json();
        }
        else {
            return null;
        }
    }).catch(handleError);

    if(responseData) {
        await setLocalMedia(true, true);
        roomId = responseData['room-id'];
        document.getElementById('room-id').innerText = roomId;
        socket.emit('join', { 'room-id': roomId });
    }
    else {
        socket.close();
        toggleButtonDisability(false);
    }
}

async function joinRoom() {
    toggleButtonDisability(true);
    setupSocket();
    roomId = document.getElementById('join-room-text').value;
    clientName = document.getElementById('clientname-text').value;

    let responseData = await fetch('/joinRoom?roomId=' + roomId, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        }
    }).then(async response => {
        if (response.status === 200) {
            return response.text();
        }
        else {
            return null;
        }
    }).catch(handleError);

    if(responseData) {
        await setLocalMedia(true, true);
        document.getElementById('room-id').innerText = roomId;
        socket.emit('join', { 'room-id': roomId, 'client-name': clientName, 'client-id': clientId});
    }
    else {
        socket.close();
        toggleButtonDisability(false);
    }
}

async function addStream() {
    const audioEnabled = document.getElementById('audio-check').checked;
    const videoEnabled = document.getElementById('video-check').checked;
    if(audioEnabled || videoEnabled) {
        const instance = instances;
        try {
            await setLocalMedia(audioEnabled, videoEnabled);
            if(Object.keys(peerConnections).length !== 0) {
                Object.keys(peerConnections).forEach((key) => {
                    localStreams[instance].getTracks().forEach((track) => {
                        peerConnections[key].pc.addTrack(track, localStreams[instance]);
                    });
                    createOffer(key);
                });
            }
        }
        catch (error) {
            handleError(error);
        }
    }
    else {
        console.log('Select Atleast one device !');
    }
}

function toggleButtonDisability(disable) {
    document.getElementById('btn-join-room').disabled = disable;
    document.getElementById('btn-create-room').disabled = disable;
    if(disable === true) {
        document.getElementById('sec-details').style.display = 'none';
        document.getElementById('sec-controls').style.display = 'block';
    }
    else {
        document.getElementById('sec-details').style.display = 'block';
        document.getElementById('sec-controls').style.display = 'none';
    }
}

function getSelectDeviceOptions(videoEnabled, audioEnabled, instance) {
    const selectAudio = document.createElement('select');
    const selectVideo = document.createElement('select');

    selectAudio.setAttribute('id', 'audio-source-' + instance);
    selectVideo.setAttribute('id', 'video-source-' + instance);

    selectAudio.classList.add('form-control', 'mb-2');
    selectVideo.classList.add('form-control', 'mb-2');

    selectAudio.disabled = !audioEnabled;
    selectVideo.disabled = !videoEnabled;

    selectAudio.addEventListener('change', changeDevice);
    selectVideo.addEventListener('change', changeDevice);

    return [selectAudio, selectVideo];
}

function getVideoMetaData(videoTag, videoId, videoInstance = null) {
    return {
        'video-tag': videoTag,
        'video-id': videoId,
        'video-instance': videoInstance
    };
}

function getVideoConstraints(autoplay, muted, local, playsInLine, videoEnabled = true, audioEnabled = true) {
    return {
        'autoplay': autoplay,
        'muted': muted,
        'local': local,
        'playsInLine': playsInLine,
        'video-enabled': videoEnabled,
        'audio-enabled': audioEnabled
    };
}

function getLabelElement(labelText, labelFor) {
    const parentDiv = document.createElement('div');
    const labelElement = document.createElement('label');

    parentDiv.classList.add('text-center');

    labelElement.setAttribute('for', labelFor);
    labelElement.innerText = labelText;

    parentDiv.appendChild(labelElement);

    return parentDiv;
}

function getControlsDiv(instance, audioEnabled, videoEnabled) {
    const controlsDiv = document.createElement('div');
    controlsDiv.classList.add('controls');

    if(audioEnabled === true) {
        const toggleMicrophone = document.createElement('i');
        toggleMicrophone.setAttribute('id', 'mic-' + instance);
        toggleMicrophone.classList.add('fas', 'fa-microphone');
        toggleMicrophone.addEventListener('click', onClickAudioControl);
        controlsDiv.appendChild(toggleMicrophone);
    }
    if(videoEnabled === true) {
        const toggleVideo = document.createElement('i');
        toggleVideo.setAttribute('id', 'vid-' + instance);
        toggleVideo.classList.add('fas', 'fa-video', 'ml-5');
        toggleVideo.addEventListener('click', onClickVideoControl);
        controlsDiv.appendChild(toggleVideo);
    }
    controlsDiv.addEventListener('mouseover', () => {
        controlsDiv.style.display = 'block';
    });

    controlsDiv.addEventListener('mouseout', () => {
        controlsDiv.style.display = 'none';
    });

    return controlsDiv;
}

function getVideoElement(videoMetaData, constraints, display = true) {
    const parentDiv = document.createElement('div');
    const videoElement = document.createElement('video');

    parentDiv.classList.add('col-md-4');

    if(display === false) {
        parentDiv.style.display = 'none';
    }

    let videoId = videoMetaData['video-id'];

    if(videoMetaData['video-instance'] !== null) {
        videoId = videoId + '-' + videoMetaData['video-instance'];
    }

    videoElement.setAttribute('id', videoId);
    videoElement.playsInline = constraints['playsInline'];
    videoElement.muted = constraints['muted'];
    videoElement.autoplay = constraints['autoplay'];

    if(constraints['local'] === true) {
        const controlsDiv = getControlsDiv(videoMetaData['video-instance'], constraints['audio-enabled'], constraints['video-enabled']);

        videoElement.classList.add('transformX');

        parentDiv.addEventListener('mouseover', () => {
            controlsDiv.style.display = 'block';
        });

        parentDiv.addEventListener('mouseout', () => {
            controlsDiv.style.display = 'none';
        });

        const selections = getSelectDeviceOptions(constraints['video-enabled'], constraints['audio-enabled'],
            videoMetaData['video-instance']);

        parentDiv.appendChild(selections[0]);
        parentDiv.appendChild(selections[1]);
        parentDiv.appendChild(controlsDiv);
    }

    parentDiv.appendChild(videoElement);
    parentDiv.appendChild(getLabelElement(videoMetaData['video-tag'], videoElement.id));

    if(constraints['local'] === true) {
        document.getElementById('local-video-display').appendChild(parentDiv);
    }
    else {
        document.getElementById('remote-video-display').appendChild(parentDiv);
    }

    return videoElement;
}

function onClickAudioControl(audioControlElement) {
    const index = audioControlElement.target.id.split('-')[1];
    if(audioMuted[index]) {
        audioMuted[index] = false;
        localStreams[index].getAudioTracks()[0].enabled = true;
        audioControlElement.target.classList.replace('fa-microphone-slash', 'fa-microphone');
    }
    else {
        audioMuted[index] = true;
        localStreams[index].getAudioTracks()[0].enabled = false;
        audioControlElement.target.classList.replace('fa-microphone', 'fa-microphone-slash');
    }
}

function onClickVideoControl(videoControlElement) {
    const index = videoControlElement.target.id.split('-')[1];
    if(videoMuted[index]) {
        videoMuted[index] = false;
        localStreams[index].getVideoTracks()[0].enabled = true;
        videoControlElement.target.classList.replace('fa-video-slash', 'fa-video');
    }
    else {
        videoMuted[index] = true;
        localStreams[index].getVideoTracks()[0].enabled = false;
        videoControlElement.target.classList.replace('fa-video', 'fa-video-slash');
    }
}

function endCall(disconnectControlElement) {
    localStreams.forEach((stream) => {
        stream.getTracks().forEach((track) => {
            track.stop();
        });
    });

    localStreams = []

    Object.keys(peerConnections).forEach((key) => {
        delete peerConnections[key];
    });

    peerConnections = {};

    toggleButtonDisability(false);
    document.getElementById('room-id').innerText = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
    document.getElementById('join-room-text').value = '';

    const localVideosDiv = document.getElementById('local-video-display');
    const remoteVideosDiv = document.getElementById('remote-video-display');

    while(localVideosDiv.firstChild) {
        localVideosDiv.removeChild(localVideosDiv.lastChild);
    }

    while(remoteVideosDiv.firstChild) {
        remoteVideosDiv.removeChild(remoteVideosDiv.lastChild);
    }

    clientId = '';
    roomId = '';
    instances = 0;

    socket.close();
    socket = null;
}

async function setLocalMedia(audioEnabled = true, videoEnabled = true) {
    const userMediaConstraints = {};
    let tempStream;

    if(audioEnabled === true) {
        userMediaConstraints['audio'] = mediaConstraints['audio'];
    }
    if(videoEnabled === true) {
        userMediaConstraints['video'] = mediaConstraints['video'];
    }

    try {
        tempStream = await navigator.mediaDevices.getUserMedia(userMediaConstraints);
    }
    catch(error) {
        handleError(error);
    }

    if(tempStream) {
        localStreams.push(tempStream);
        const videoMetaData = getVideoMetaData(clientName, clientId, instances);
        const videoConstraints = getVideoConstraints(true, true, true, true, videoEnabled, audioEnabled);
        const videoElement = getVideoElement(videoMetaData, videoConstraints);

        await navigator.mediaDevices.enumerateDevices().then((deviceInfos) => {
            gotDevices(deviceInfos, [document.getElementById('audio-source-' + instances),
                document.getElementById('video-source-' + instances)], instances);
        }).catch(handleError);

        videoElement.srcObject = localStreams[instances];
        audioMuted.push(false);
        videoMuted.push(false);
        instances++;
    }
}

async function setUpConnection(peerId, peerName, initiateCall = false) {
    peerConnections[peerId] = { 'peer-name': peerName, 'pc': new RTCPeerConnection(iceServers) };
    peerConnections[peerId].pc.ontrack = (track) => { setRemoteStream(track, peerId, peerName); };
    addLocalStreamTracks(peerId);
    peerConnections[peerId].pc.onicecandidate = (iceCandidate) => { gatherIceCandidates(iceCandidate, peerId); };

    if(initiateCall === true) {
        await createOffer(peerId);
    }
}

async function createOffer(peerId) {
    try {
        const offer = await peerConnections[peerId].pc.createOffer();
        await peerConnections[peerId].pc.setLocalDescription(offer);
        socket.emit('offer', { 'room-id': roomId, 'offer-sdp': offer, 'client-id': clientId, 'peer-id': peerId });
    }
    catch(error) {
        handleError(error);
    }
}

function addLocalStreamTracks(peerId) {
    localStreams.forEach((stream) => {
        if(stream) {
            stream.getTracks().forEach((track) => {
                peerConnections[peerId].pc.addTrack(track, stream);
            });
        }
    });
}

async function setRemoteStream(trackEvent, peerId, peerName) {
    const vidElements = document.querySelectorAll(`[id^="${ peerId }"]`);
    const length = vidElements.length;
    let videoElement = vidElements[length - 1];
    const nextIndex = videoElement ? Number(vidElements[length - 1].id.split('~')[1]) + 1 : 0;

    if((videoElement) && (videoElement.srcObject.id === trackEvent.streams[0].id)) {
        videoElement.srcObject = trackEvent.streams[0];
    }
    else {
        const videoMetaData = getVideoMetaData(peerName, peerId + '~' + nextIndex);
        const constraints = getVideoConstraints(true, false, false, true);
        videoElement = getVideoElement(videoMetaData, constraints);
        videoElement.srcObject = trackEvent.streams[0];
    }
}

function gatherIceCandidates(iceCandidate, peerId) {
    if(iceCandidate.candidate != null) {
        socket.emit('ice-candidate', {'ice-candidate': iceCandidate.candidate, 'room-id': roomId, 'client-id': clientId, 'peer-id': peerId });
    }
}

// Changing Input Sources Functions
function changeDevice(changeEvent) {
    const index = changeEvent.target.id.split('-')[2];
    const userMediaConstraints = {};

    if(localStreams[index]) {
        localStreams[index].getTracks().forEach(track => {
            track.stop();
        });
    }

    const audioSource = document.getElementById('audio-source-' + index);
    const videoSource = document.getElementById('video-source-' + index);

    userMediaConstraints['audio'] = mediaConstraints['audio'];
    userMediaConstraints['audio']['deviceId'] = audioSource.value ? { exact: audioSource.value } : undefined;
    userMediaConstraints['video'] = mediaConstraints['video'];
    userMediaConstraints['video']['deviceId'] = videoSource.value ? { exact: videoSource.value } : undefined;

    navigator.mediaDevices.getUserMedia(userMediaConstraints).then((updatedStream) => {
        return gotStream(updatedStream, index);
    }).then((deviceInfo) => {
        gotDevices(deviceInfo, [audioSource, videoSource], index);
    }).catch(handleError);
}

function gotStream(updatedStream, index) {
    const ids = [];

    localStreams[index].getTracks().forEach((track) => {
        ids.push(track.id);
    });

    const videoElement = document.getElementById(clientId + '-' + index);
    localStreams[index] = updatedStream;
    videoElement.srcObject = localStreams[index];
    changeTracks(ids, index);
    return navigator.mediaDevices.enumerateDevices();
}

function changeTracks(ids, index) {
    if(Object.keys(peerConnections).length !== 0) {
        Object.keys(peerConnections).forEach((key) => {
            peerConnections[key].pc.getSenders().forEach((sender) => {
                ids.forEach((id) => {
                    if(sender.track.id === id) {
                        if(sender.track.kind === 'audio') {
                            sender.replaceTrack(localStreams[index].getAudioTracks()[0]);
                        }
                        else if(sender.track.kind === 'video') {
                            sender.replaceTrack(localStreams[index].getVideoTracks()[0]);
                        }
                    }
                });
            });
        });
    }
}

function gotDevices(deviceInfos, selectors, index) {
    // Handles being called several times to update labels. Preserve values.
    const values = selectors.map(select => select.value);
    selectors.forEach(select => {
        while (select.firstChild) {
            select.removeChild(select.firstChild);
        }
    });
    for (let i = 0; i !== deviceInfos.length; ++i) {
        const deviceInfo = deviceInfos[i];
        const option = document.createElement('option');
        option.value = deviceInfo.deviceId;
        if (deviceInfo.kind === 'audioinput') {
            option.text = deviceInfo.label || `microphone ${document.getElementById('audio-source-' + index).length + 1}`;
            document.getElementById('audio-source-' + index).appendChild(option);
        } else if (deviceInfo.kind === 'videoinput') {
            option.text = deviceInfo.label || `camera ${document.getElementById('video-source-' + index).length + 1}`;
            document.getElementById('video-source-' + index).appendChild(option);
        }
    }
    selectors.forEach((select, selectorIndex) => {
        if (Array.prototype.slice.call(select.childNodes).some(n => n.value === values[selectorIndex])) {
            select.value = values[selectorIndex];
        }
    });
}

// Socket Functions
function setupSocket() {
    socket = io();
    socket.on('connect', onConnect);
    socket.on('room-joined', onRoomJoined);
    socket.on('ice-candidate', onIceCandidate);
    socket.on('send-metadata', onMetaData);
    socket.on('offer', onOffer);
    socket.on('answer', onAnswer);
    socket.on('client-disconnected', onClientDisconnected);
}

function onConnect() {
    clientId = socket.id;
}

async function onRoomJoined(data) {
    socket.emit('send-metadata', { 'room-id': roomId, 'client-name': clientName, 'client-id': clientId, 'peer-id': data['client-id'] });
    await setUpConnection(data['client-id'], data['client-name'], true);
}

async function onMetaData(data) {
    if(data['peer-id'] === clientId) {
        try {
            await setUpConnection(data['client-id'], data['client-name']);
        }
        catch(error) {
            handleError(error);
        }
    }
}

async function onIceCandidate(data) {
    if(data['peer-id'] === clientId) {
        try {
            await peerConnections[data['client-id']].pc.addIceCandidate(new RTCIceCandidate(data['ice-candidate']));
        }
        catch(error) {
            handleError(error);
        }
    }
}

async function onOffer(data) {
    if(data['peer-id'] === clientId) {
        try {
            await peerConnections[data['client-id']].pc.setRemoteDescription(new RTCSessionDescription(data['offer-sdp']));
            const answer = await peerConnections[data['client-id']].pc.createAnswer();
            peerConnections[data['client-id']].pc.setLocalDescription(new RTCSessionDescription(answer));
            socket.emit('answer', { 'room-id': roomId, 'answer-sdp': answer, 'client-id': clientId, 'peer-id': data['client-id'] });
        }
        catch(error) {
            handleError(error);
        }
    }
}

async function onAnswer(data) {
    if(data['peer-id'] === clientId) {
        try {
            await peerConnections[data['client-id']].pc.setRemoteDescription(new RTCSessionDescription(data['answer-sdp']));
        }
        catch(error) {
            handleError(error);
        }
    }
}

function onClientDisconnected(data) {
    if(peerConnections[data['client-id']]) {
        delete peerConnections[data['client-id']];

        const vidList = document.querySelectorAll(`[id^="${data['client-id']}"]`);

        vidList.forEach((vidElement) => {
            vidElement.srcObject = null;
            vidElement.parentElement.remove();
        });
    }
}

// Error Functions
function handleError(error) {
    console.log('An Error Occurred : ' + error);
}
