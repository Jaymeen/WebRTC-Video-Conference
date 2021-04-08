let socket;
window.onload = getUniqueId();
let clientName;
// const videoSelect = document.querySelector('select#video-input-source');
// const audioInputSelect = document.querySelector('select#audio-input-source');
// const audioOutputSelect = document.querySelector('select#audio-output-source');

let localStream;
let peerConnections = {};
let roomId;
let clientId;
// const selectors = [audioInputSelect, audioOutputSelect, videoSelect];
// audioOutputSelect.disabled = !('sinkId' in HTMLMediaElement.prototype);

const mediaConstraints = {
    audio: {
        echoCancellation: true
    },
    video: true,
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
    await fetch('/clientId', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        }
    }).then(response => {
        if(response.status === 200) {
            return response.json();
        }
    }).then(data => {
        clientId = data['client-id'];
    }).catch(handleError);
}

async function createRoom(element) {
    setupSocket();
    clientName = document.querySelector('input#clientname-text').value;

    await fetch('/createRoom', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        }
    }).then(response => {
        if(response.status === 200) {
            return response.json();
        }
    }).then(async data => {
        await setLocalMedia();
        roomId = data['room-id'];
        document.querySelector('div#room-id').innerText = roomId;
        socket.emit('join', { 'room-id': roomId });
    }).catch(handleError);
}

async function joinRoom() {
    setupSocket();
    roomId = document.querySelector('input#join-room-text').value;
    clientName = document.querySelector('input#clientname-text').value;

    const output = await fetch('/joinRoom?roomId=' + roomId, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        }
    }).then(async response => {
        if (response.status === 200) {
            await setLocalMedia();
            document.querySelector('div#room-id').innerText = roomId;
            return response.text();
        }
    }).then(data => {
        socket.emit('join', { 'room-id': roomId, 'client-name': clientName, 'client-id': clientId});
    }).catch(handleError);
}

function getVideoElement(element_id, instance, labelName) {
    const videoDisplayDiv = document.querySelector('div#video-display');
    const innerDiv = document.createElement('div');
    innerDiv.setAttribute('class', 'col-md-4');
    const videoElement = document.createElement('video');
    videoElement.setAttribute('id', element_id + '-' + instance);
    videoElement.setAttribute('autoplay', '');
    videoElement.style.width = 'inherit';
    videoElement.style.height = 'inherit';
    const labelDiv = document.createElement('div');
    labelDiv.setAttribute('class', 'text-center');
    const label = document.createElement('label');
    label.setAttribute('for', element_id + '-' + instance);
    label.innerText = labelName;
    labelDiv.appendChild(label);
    innerDiv.appendChild(videoElement);
    innerDiv.appendChild(labelDiv);
    videoDisplayDiv.appendChild(innerDiv);

    return videoElement;
}

async function setLocalMedia() {
    navigator.mediaDevices.enumerateDevices().then((deviceInfos) => {
        gotDevices(deviceInfos, [document.getElementById('audio-input-source'), document.getElementById('video-input-source')]);
    }).catch(handleError);

    try {
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    }
    catch(error) {
        handleError(error);
    }

    const localVideo = getVideoElement(clientId, 0, clientName);
    localVideo.srcObject = localStream;
    document.querySelector('hr#horizontal-row').hidden = false;
    document.querySelector('div#div-select').hidden = false;
}

async function setUpConnection(peerId, peerName, initiateCall = false) {
    // console.log('Inside Setup Connection !');
    const videoElement = getVideoElement(peerId, 0, peerName);
    peerConnections[peerId] = { 'peer-name': peerName, 'pc': new RTCPeerConnection(iceServers) };
    peerConnections[peerId].pc.ontrack = (track) => { setRemoteStream(track, peerId); };
    addLocalStreamTracks(peerId);
    peerConnections[peerId].pc.onicecandidate = (iceCandidate) => { gatherIceCandidates(iceCandidate, peerId); };
    peerConnections[peerId].pc.oniceconnectionstatechange = (event) => { checkPeerDisconnection(event, peerId); }

    if(initiateCall === true) {
        await createOffer(peerId);
    }
}

async function createOffer(peerId) {
    // console.log('Create Offer Initiated !');
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
    // console.log('Adding Local Tracks !');
    localStream.getTracks().forEach((track) => {
        peerConnections[peerId].pc.addTrack(track, localStream);
    });
}

async function setRemoteStream(track, peerId) {
    document.getElementById(peerId+'-0').srcObject = track.streams[0];
}

function gatherIceCandidates(iceCandidate, peerId) {
    if(iceCandidate.candidate != null) {
        // console.log('inside Ice Candidates');
        socket.emit('ice-candidate', {'ice-candidate': iceCandidate.candidate, 'room-id': roomId, 'client-id': clientId, 'peer-id': peerId });
    }
}

function checkPeerDisconnection(event, peerId) {
    console.log('conn state changed !');
    let state = peerConnections[peerId].pc.iceConnectionState;

    if(state === 'failed' || state === 'closed' || state === 'disconnected') {
        delete peerConnections[peerId];
        const elementToDelete = document.getElementById(peerId + '-0').parentElement;
        elementToDelete.parentElement.removeChild(elementToDelete);
    }
}

// Changing Input Sources Functions
function changeDevice() {
    if(localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
        });
    }
    const audioSource = document.querySelector('select#audio-input-source').value;
    const videoSource = document.querySelector('select#video-input-source').value;
    const constraints = {
        audio: {deviceId: audioSource ? {exact: audioSource} : undefined},
        video: {deviceId: videoSource ? {exact: videoSource} : undefined}
    };
    navigator.mediaDevices.getUserMedia(constraints).then(gotStream).then((deiveInfo) => {
        gotDevices(deviceInfo, [document.getElementById('audio-input-source'), document.getElementById('video-input-source')]);
    }).catch(handleError);
}

function gotStream(updatedStream) {
    // console.log('Got Stream called !');
    const videoElement = document.getElementById(clientId + '-' + 0);
    localStream = updatedStream;
    videoElement.srcObject = localStream;
    changeTracks();
    return navigator.mediaDevices.enumerateDevices();
}

function changeTracks() {
    // console.log('Change Tracks Called !');
    if(Object.keys(peerConnections).length !== 0) {
        Object.keys(peerConnections).forEach(key => {
            peerConnections[key].pc.getSenders().forEach(sender => {
                if(sender.track.kind === 'audio') {
                    sender.replaceTrack(localStream.getAudioTracks()[0]);
                }
                else if(sender.track.kind === 'video') {
                    sender.replaceTrack(localStream.getVideoTracks()[0]);
                }
            });
        });
    }
}

function gotDevices(deviceInfos, selectors) {
    console.log(deviceInfos);
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
            option.text = deviceInfo.label || `microphone ${audioInputSelect.length + 1}`;
            document.getElementById('audio-input-source').appendChild(option);
        // } else if (deviceInfo.kind === 'audiooutput') {
        //     option.text = deviceInfo.label || `speaker ${audioOutputSelect.length + 1}`;
        //     audioOutputSelect.appendChild(option);
        } else if (deviceInfo.kind === 'videoinput') {
            option.text = deviceInfo.label || `camera ${videoSelect.length + 1}`;
            document.getElementById('video-input-source').appendChild(option);
        // } else {
        //     console.log('Some other kind of source/device: ', deviceInfo);
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
}

async function onRoomJoined(data) {
    await setUpConnection(data['client-id'], data['client-name']);
    socket.emit('send-metadata', { 'room-id': roomId, 'client-name': clientName, 'client-id': clientId, 'peer-id': data['client-id'] });
}

async function onMetaData(data) {
    if(data['peer-id'] === clientId) {
        try {
            // console.log('meta-data recieved !');
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
            // console.log('Ice Candidates Recieved !');
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
            // console.log('Offer Recieved !');
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
            // console.log('Answer Recieved !');
            await peerConnections[data['client-id']].pc.setRemoteDescription(new RTCSessionDescription(data['answer-sdp']));
        }
        catch(error) {
            handleError(error);
        }
    }
}

// Error Functions
function handleError(error) {
    // console.log('An Error Occurred : ' + error);
}
