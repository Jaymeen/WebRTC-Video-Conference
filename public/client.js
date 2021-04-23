let socket;
window.onload = getUniqueId();
let clientName;

let localStream;
let peerConnections = {};
let roomId;
let clientId;

let muteaudio = false;
let mutevideo = false;

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
    document.getElementById('btn-join-room').disabled = true;
    document.getElementById('btn-create-room').disabled = true;
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
        else {
            document.getElementById('btn-join-room').disabled = false;
            document.getElementById('btn-create-room').disabled = false;
        }
    }).then(async data => {
        await setLocalMedia();
        roomId = data['room-id'];
        document.querySelector('div#room-id').innerText = roomId;
        socket.emit('join', { 'room-id': roomId });
    }).catch(handleError);
}

async function joinRoom() {
    document.getElementById('btn-join-room').disabled = true;
    document.getElementById('btn-create-room').disabled = true;
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
        else {
            document.getElementById('btn-join-room').disabled = false;
            document.getElementById('btn-create-room').disabled = false;
        }
    }).then(data => {
        socket.emit('join', { 'room-id': roomId, 'client-name': clientName, 'client-id': clientId});
    }).catch(handleError);
}

function getVideoElement(element_id, instance, labelName, isLocalVideo = false) {
    const videoDisplayDiv = document.querySelector('div#video-display');
    const innerDiv = document.createElement('div');
    innerDiv.setAttribute('class', 'col-md-4');
    const videoElement = document.createElement('video');
    videoElement.setAttribute('id', element_id + '-' + instance);
    videoElement.style.width = '350px';
    videoElement.style.height = '262px';
    videoElement.style.objectFit = 'cover';
    videoElement.style.transform = 'scaleX(-1)';
    const labelDiv = document.createElement('div');
    labelDiv.setAttribute('class', 'text-center');
    const label = document.createElement('label');
    label.setAttribute('for', element_id + '-' + instance);
    label.innerText = labelName;
    labelDiv.appendChild(label);
    innerDiv.appendChild(videoElement);
    innerDiv.appendChild(labelDiv);
    if(isLocalVideo === true) {
        const controlsDiv = document.createElement('div');
        controlsDiv.classList.add('text-center');
        controlsDiv.style.display = 'none';
        controlsDiv.setAttribute('id', 'controls-div');
        controlsDiv.style.zIndex = 1;
        controlsDiv.style.position = 'absolute';
        controlsDiv.style.backgroundColor = '#2921219e';
        controlsDiv.style.color = 'white';
        controlsDiv.style.marginLeft = '15px';
        controlsDiv.style.width = '351px';
        controlsDiv.style.fontSize = '40px';
        controlsDiv.innerHTML = '<i class="fas fa-microphone" style="cursor: pointer;"></i>' +
            '<i class="fas fa-video ml-5" style="cursor: pointer;"></i>' +
            '<i class="fas fa-phone-slash ml-5" style="color: orangered; cursor: pointer;"></i>';

        innerDiv.addEventListener('mouseover', (mouseOverEvent) => {
            controlsDiv.style.display = 'block';
        });

        innerDiv.addEventListener('mouseout', (mouseOutEvent) => {
            controlsDiv.style.display = 'none';
        });

        controlsDiv.addEventListener('mouseover', (mouseOverEvent) => {
            controlsDiv.style.display = 'block';
        });

        controlsDiv.addEventListener('mouseout', (mouseOutEvent) => {
            controlsDiv.style.display = 'none';
        });

        controlsDiv.children[0].addEventListener('click', onClickAudioControl);
        controlsDiv.children[1].addEventListener('click', onClickVideoControl);
        //controlsDiv.children[2].addEventListener('click', onClickDisconnectControl);

        videoDisplayDiv.appendChild(controlsDiv);
    }
    videoDisplayDiv.appendChild(innerDiv);

    return videoElement;
}

function onClickAudioControl(audioControlElement) {
    if(muteaudio) {
        muteaudio = false;
        localStream.getAudioTracks()[0].enabled = true;
        audioControlElement.target.classList.replace('fa-microphone-slash', 'fa-microphone');
    }
    else {
        muteaudio = true;
        localStream.getAudioTracks()[0].enabled = false;
        audioControlElement.target.classList.replace('fa-microphone', 'fa-microphone-slash');
    }
}

function onClickVideoControl(videoControlElement) {
    if(mutevideo) {
        mutevideo = false;
        localStream.getVideoTracks()[0].enabled = true;
        videoControlElement.target.classList.replace('fa-video-slash', 'fa-video');
    }
    else {
        mutevideo = true;
        localStream.getVideoTracks()[0].enabled = false;
        videoControlElement.target.classList.replace('fa-video', 'fa-video-slash');
    }
}

function onClickDisconnectControl(disconnectControlElement) {
    localStream.getTracks().forEach((track) => {
        track.stop();
    });

    Object.keys(peerConnections).forEach((key) => {
        peerConnections[key].pc.ontrack = null;
        peerConnections[key].pc.onremovetrack = null;
        peerConnections[key].pc.onicecandidate = null;
        peerConnections[key].pc.oniceconnectionstatechange = null;
        peerConnections[key].pc.onsignalingstatechange = null;
        peerConnections[key].pc.onicegatheringstatechange = null;
        peerConnections[key].pc.onnegotiationneeded = null;
        peerConnections[key].pc.close();
        delete peerConnections[key];
    });

    peerConnections = {};

    document.getElementById(clientId + '-0').srcObject = null;

    let videoDisplayDiv = document.getElementById('video-display');
    const containerDiv = videoDisplayDiv.parentNode;

    videoDisplayDiv.remove();

    videoDisplayDiv = document.createElement('div');
    videoDisplayDiv.setAttribute('id', 'video-display');
    videoDisplayDiv.classList.add('row', 'mt-5');
    containerDiv.appendChild(videoDisplayDiv);

    document.getElementById('btn-join-room').disabled = false;
    document.getElementById('btn-create-room').disabled = false;
    document.querySelector('div#room-id').innerText = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
    document.querySelector('hr#horizontal-row').hidden = true;
    document.querySelector('div#div-select').hidden = true;

    socket.close();
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

    const localVideo = getVideoElement(clientId, 0, clientName, true);
    localVideo.autoplay = true;
    localVideo.muted = true;
    localVideo.playsInline = true;
    localVideo.srcObject = localStream;
    document.querySelector('hr#horizontal-row').hidden = false;
    document.querySelector('div#div-select').hidden = false;
}

async function setUpConnection(peerId, peerName, initiateCall = false) {
    const videoElement = getVideoElement(peerId, 0, peerName);
    videoElement.autoplay = true;
    // videoElement.muted = true;
    videoElement.playsInline = true;
    peerConnections[peerId] = { 'peer-name': peerName, 'pc': new RTCPeerConnection(iceServers) };
    peerConnections[peerId].pc.ontrack = (track) => { setRemoteStream(track, peerId); };
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
    localStream.getTracks().forEach((track) => {
        peerConnections[peerId].pc.addTrack(track, localStream);
    });
}

async function setRemoteStream(track, peerId) {
    document.getElementById(peerId+'-0').srcObject = track.streams[0];
}

function gatherIceCandidates(iceCandidate, peerId) {
    if(iceCandidate.candidate != null) {
        socket.emit('ice-candidate', {'ice-candidate': iceCandidate.candidate, 'room-id': roomId, 'client-id': clientId, 'peer-id': peerId });
    }
}

function checkPeerDisconnection(event, peerId) {
    let state = peerConnections[peerId].pc.iceConnectionState;

    if(state === 'failed' || state === 'closed' || state === 'disconnected') {
        console.log('User : ' + peerId + ' Disconnected');
        delete peerConnections[peerId];
        document.getElementById(peerId + '-0').parentElement.remove();
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
    const videoElement = document.getElementById(clientId + '-' + 0);
    localStream = updatedStream;
    videoElement.srcObject = localStream;
    changeTracks();
    return navigator.mediaDevices.enumerateDevices();
}

function changeTracks() {
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
        } else if (deviceInfo.kind === 'videoinput') {
            option.text = deviceInfo.label || `camera ${videoSelect.length + 1}`;
            document.getElementById('video-input-source').appendChild(option);
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

// Error Functions
function handleError(error) {
    console.log('An Error Occurred : ' + error);
}
