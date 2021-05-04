window.onload = getUniqueId();
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

async function getUniqueId() {
    let responseData = await fetch('/clientId', {
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
        clientId = responseData['client-id'];
    }
}

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
        await setLocalMedia();
        roomId = roomId = responseData['room-id'];
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
        await setLocalMedia();
        document.getElementById('room-id').innerText = roomId;
        socket.emit('join', { 'room-id': roomId, 'client-name': clientName, 'client-id': clientId});
    }
    else {
        socket.close();
        toggleButtonDisability(false);
    }
}

async function addStream() {
    const instance = instances;
    try {
        await setLocalMedia(true, true);
        if(Object.keys(peerConnections).length !== 0) {
            Object.keys(peerConnections).forEach(key => {
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

function toggleButtonDisability(disable) {
    document.getElementById('btn-join-room').disabled = disable;
    document.getElementById('btn-create-room').disabled = disable;
}

function getSelectDeviceOptions(videoEnabled, audioEnabled, instance) {
    const selectAudio = document.createElement('select');
    const selectVideo = document.createElement('select');

    selectAudio.setAttribute('id', 'audio-source-' + instance);
    selectVideo.setAttribute('id', 'video-source-' + instance);

    selectAudio.classList.add('form-control', 'mb-2');
    selectVideo.classList.add('form-control', 'mb-2');

    selectAudio.disabled = audioEnabled;
    selectVideo.disabled = videoEnabled;

    selectAudio.addEventListener('change', changeDevice);
    selectVideo.addEventListener('change', changeDevice);

    return [selectAudio, selectVideo];
}

function getVideoMetaData(videoTag, videoId, videoInstance = null) {
    return {
        'video-tag': videoTag,
        'video-id': videoId,
        'video-instance': videoInstance
    }
}

function getVideoConstraints(autoplay, muted, local, playsInLine, videoEnabled, audioEnabled) {
    return {
        'autoplay': autoplay,
        'muted': muted,
        'local': local,
        'playsInLine': playsInLine,
        'video-enabled': videoEnabled,
        'audio-enabled': audioEnabled
    }
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

function getControlsDiv(instance) {
    const controlsDiv = document.createElement('div');
    const toggleMicrophone = document.createElement('i');
    const toggleVideo = document.createElement('i');
    const disconnectCall = document.createElement('i');

    toggleMicrophone.setAttribute('id', 'mic-' + instance);
    toggleVideo.setAttribute('id', 'vid-' + instance);

    controlsDiv.classList.add('controls');
    toggleMicrophone.classList.add('fas', 'fa-microphone');
    toggleVideo.classList.add('fas', 'fa-video', 'ml-5');
    disconnectCall.classList.add('fas', 'fa-phone-slash', 'ml-5', 'redcontrol');

    controlsDiv.addEventListener('mouseover', () => {
        controlsDiv.style.display = 'block';
    });

    controlsDiv.addEventListener('mouseout', () => {
        controlsDiv.style.display = 'none';
    });

    toggleMicrophone.addEventListener('click', onClickAudioControl);
    toggleVideo.addEventListener('click', onClickVideoControl);
    disconnectCall.addEventListener('click', onClickDisconnectControl);

    controlsDiv.appendChild(toggleMicrophone);
    controlsDiv.appendChild(toggleVideo);
    controlsDiv.appendChild(disconnectCall);

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
        const controlsDiv = getControlsDiv(videoMetaData['video-instance']);

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

function onClickDisconnectControl(disconnectControlElement) {
    // Change this to remove tracks.
    // localStream.getTracks().forEach((track) => {
    //     track.stop();
    // });
    //
    // Object.keys(peerConnections).forEach((key) => {
    //     peerConnections[key].pc.ontrack = null;
    //     peerConnections[key].pc.onremovetrack = null;
    //     peerConnections[key].pc.onicecandidate = null;
    //     peerConnections[key].pc.oniceconnectionstatechange = null;
    //     peerConnections[key].pc.onsignalingstatechange = null;
    //     peerConnections[key].pc.onicegatheringstatechange = null;
    //     peerConnections[key].pc.onnegotiationneeded = null;
    //     peerConnections[key].pc.close();
    //     delete peerConnections[key];
    // });
    //
    // peerConnections = {};
    //
    // document.getElementById(clientId + '-0').srcObject = null;
    //
    // let videoDisplayDiv = document.getElementById('video-display');
    // const containerDiv = videoDisplayDiv.parentNode;
    //
    // videoDisplayDiv.remove();
    //
    // videoDisplayDiv = document.createElement('div');
    // videoDisplayDiv.setAttribute('id', 'video-display');
    // videoDisplayDiv.classList.add('row', 'mt-5');
    // containerDiv.appendChild(videoDisplayDiv);
    //
    // document.getElementById('btn-join-room').disabled = false;
    // document.getElementById('btn-create-room').disabled = false;
    // document.getElementById('room-id').innerText = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
    // document.getElementById('join-room-text').value = '';
    //
    // socket.emit('end-call', { 'room-id': roomId, 'client-id': clientId });
    // socket.close();
    // socket = null;
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
        const videoConstraints = getVideoConstraints(true, true, true, true);
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
    peerConnections[peerId].pc.oniceconnectionstatechange = (event) => { checkPeerDisconnection(event, peerId); };

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

function setRemoteStream(trackEvent, peerId, peerName) {
    let videoElement = document.getElementById(peerId.slice(-5) + '-' + trackEvent.streams[0].id);

    if(videoElement) {
        videoElement.srcObject = trackEvent.streams[0];
    }
    else {
        const videoMetaData = getVideoMetaData(peerName, peerId.slice(-5) + '-' + trackEvent.streams[0].id);
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

function checkPeerDisconnection(event, peerId) {
    // if(peerConnections[peerId]) {
    //     let state = peerConnections[peerId].pc.iceConnectionState;
    //
    //     if(state === 'failed' || state === 'closed' || state === 'disconnected') {
    //         delete peerConnections[peerId];
    //         document.getElementById(peerId + '-0').parentElement.remove();
    //     }
    // }
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
        Object.keys(peerConnections).forEach(key => {
            peerConnections[key].pc.getSenders().forEach(sender => {
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
    socket.on('room-joined', onRoomJoined);
    socket.on('ice-candidate', onIceCandidate);
    socket.on('send-metadata', onMetaData);
    socket.on('offer', onOffer);
    socket.on('answer', onAnswer);
    socket.on('end-call', onEndCall);
}

async function onRoomJoined(data) {
    await setUpConnection(data['client-id'], data['client-name']);
    socket.emit('send-metadata', { 'room-id': roomId, 'client-name': clientName, 'client-id': clientId, 'peer-id': data['client-id'] });
}

async function onMetaData(data) {
    if(data['peer-id'] === clientId) {
        try {
            await setUpConnection(data['client-id'], data['client-name'], true);
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

function onEndCall(data) {
    // delete peerConnections[data['client-id']];
    // document.getElementById(data['client-id'] + '-0').parentElement.remove();
}

// Error Functions
function handleError(error) {
    console.log('An Error Occurred : ' + error);
}
