//İstemci tarafında çalışan, WebSocket üzerinden kullanıcıların sesli arama yapmasını sağlayan kodlardır.

const socket = new WebSocket("ws://localhost:3000"); // localde test için bu kullanılacak.

//HTML'deki belirtilen öğelere erişimi sağlar.
const userList = document.getElementById("userList");
const startCallButton = document.getElementById("startCall");
const endCallButton = document.getElementById("endCall");
const statusDiv = document.getElementById("status");
const localAudio = document.getElementById("localAudio");
const remoteAudio = document.getElementById("remoteAudio");
const userIdInput = document.getElementById("userIdInput");
const myID = document.getElementById("myID");
const acceptCallButton = document.getElementById("acceptCall");
const rejectCallButton = document.getElementById("rejectCall");
const incomingCallMessage = document.getElementById("incomingCallMessage");
const incomingCallDiv = document.getElementById("incomingCallDiv");
// Dinamik olarak oluşturulan incomingCallDiv öğesini doğrudan HTML içinde statik olarak tanımlamak daha iyi bir çözümdür. 
// Bu şekilde, eleman kazara silinmez ve kolaylıkla manipüle edilebilir.

let localStream;
let peerConnection;
// bu servere bağlanınca bizim için tanımlanan ID
let currentUserID;
// bu arama yapmak için seçeceğimiz kullanıcını IDsi
let selectedUserID;


//ICE Sunucuları: WebRTC bağlantısını kurmak için kullanılan STUN Suncusudur.
// birden fazla url eklenebilir buraya
const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};


// durum güncelleme fonksiyonu
function updateStatus(message) {
  statusDiv.textContent = `Durum: ${message}`;
}


// kullanıcı hariç diğer kullanıcılarının telefon numarasının gösterildiği listeyi güncelleme.
function updateUserList(users) {
  users.innerHTML = ""; // listeyi temizle
  users.forEach((telefonNo) => {
      const div = document.createElement("div");
      div.textContent = telefonNo;
      userList.appendChild(div);
    });
}


// Kullanıcının yerel mikrofonuna erişimi sağlar (yerel ses akışını sağlama).
async function getLocalStream() {
  try {
    //mikrofona erişim talebi
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localAudio.srcObject = localStream;
    updateStatus("Aramaya Hazır");
  } catch (error) {
    console.error("Medya aygıtlarının erişim hatası:", error);
    updateStatus("Hata: Mikrofon kullanılamıyor.");
  }
}



// --- İKİ CİHAZ VE İKİ SEKME ARASINDA BAĞLANTI ---
// Webrtc bağlantısını kurar ve gerekli olay dişleyicileri ayarlar.
// PeerConnection oluşturma
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(configuration); //bağlantı kurma

  // yerel ses akışını ekleme
  localStream
    .getTracks() //tüm medya parçaları alınır.
    .forEach((track) => peerConnection.addTrack(track, localStream));

  // event handlers: olay işleyiciler
  // ontrack ile karşı tarafın gönderdiği medya akışını remoteAudio'ya bağlar.
  // yani remote ses akışı alınır.
  peerConnection.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];
  };

  // onicecandidate, ice adaylarını yakalar ve bir websocket mesajı olarak karşı tarafa iletir.
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(
        JSON.stringify({
          type: "ice-candidate",
          candidate: event.candidate,
          target: selectedUserID,
        })
      );
    }
  };
}


// Gelen çağrı işlenir.
// Arama kabul ya da red edilir.
// handleOffer, bir çağrı geldiğinde çalışır.
async function handleOffer(offer, from) {
  selectedUserID = from;

  // Gelen arama ekranını görünür yapma
  incomingCallDiv.style.display = "block";
  // Aramanın kimden geldiğini içeren mesaj
  incomingCallMessage.textContent = `Incoming call from ${from}`;
  
  // ----- Kabul et butonu tıklandığında -----
  acceptCallButton.onclick = async () => {
    // Gelen arama ekranını kapat.
    incomingCallDiv.style.display = "none";
    // WebRTC bağlantısı için bir RTCPeerConnection nesnesi oluşturulur.
    createPeerConnection();

    // Gelen offer'ın bilgisini peerConnection'a uzaktan oturum tanımı.
    // RTCSessionDescription: WebRTC'de oturum bilgilerini içeren bir nesne.
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer)); 
    // Offer'a karşılık verilen cevap, yani Kabul Etme olayı.
    const answer = await peerConnection.createAnswer();
    // Cevabı peerConncection'a uygular
    await peerConnection.setLocalDescription(answer);

    socket.send(
      JSON.stringify({ // javascript'i JSON formatına dönüştürür.
        type: "answer", // answer, websocket üzerinden karşı tarafa gönderilir.
        // Gönderilen bilgiler
        answer, // aramanın cevabı
        target: from, //cevabın hedefi, yani arayan
        from: currentUserID, // cevabı veren kişinin kullanıcı kimliği
      })
    );
    updateStatus(`${from} kişiyle görüşme yapılıyor...`); 
    startCallButton.classList.add("hidden"); //arama butonunu gizleme
    endCallButton.classList.remove("hidden"); //bitirme butonunu aktif etme
  };

  // ----- Reddet butonuna tıklabdığında -----
  rejectCallButton.onclick = () => {
    // Gelen arama ekranını kapat.
    incomingCallDiv.style.display = "none";

    //JSON.stringify, JavaScript nesnelerini JSON formatına çevirerek WebSocket mesajlarını 
    //anlaşılır, taşınabilir ve standart bir şekilde karşı tarafa iletmemizi sağlar.
    socket.send(
      JSON.stringify({
        type: "rejectCall",
        target: from,
        from: currentUserID,
      })
    );
    updateStatus(` ${from} numarasından gelen arama reddedildi.`);
  };
}


// ----- SIGNAL MEKANİZMASI -----
// iki cihaz arasında bağlantı kurmak ve yönetmek için bir signal mekanizması
socket.onmessage = async (event) => {
  const message = JSON.parse(event.data);

  // bağlandım ve IDmin tanımlanmasını bekliyorum
  if (message.type === "register") {
    currentUserID = message.userID;
    myID.innerText = currentUserID;
    updateStatus(`${currentUserID} olarak bağlandı.`);
  } else if (message.type === "user-list") {
    updateUserList(message.users);
  } else if (message.type === "offer") {
    await handleOffer(message.offer, message.from);
  } else if (message.type === "answer") {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(message.answer));
    updateStatus(`${selectedUserID} ile çağrı bağlantısı kuruldu.`);
  } else if (message.type === "rejectCall") {
    alert("Call rejected");
    updateStatus("Çağrı reddedildi.");
    startCallButton.classList.remove("hidden");
    endCallButton.classList.add("hidden");
  } else if (message.type === "endCall") {
    alert("Call ended");
    updateStatus("Çağrı sona erdi.");
    startCallButton.classList.remove("hidden");
    endCallButton.classList.add("hidden");
  } else if (message.type === "ice-candidate") {
    await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
  }
};


// --- Arama Başlatma ---
startCallButton.addEventListener("click", async () => {
  if (!userIdInput.value) {
    alert("Lütfen aramak için bir kullanıcı seçin.");
    return;
  }
  // Hedef kullanıcının seçilip seçilmediğini kontrol etme

  // Hedef kullanıcı kimliğini ayarlama
  selectedUserID = userIdInput.value;

  // yerel medya akışı kontrolü
  if (!localStream) {
    await getLocalStream();
  }

  //RTCPeerConnection nesnesi oluşturma
  createPeerConnection();
  const offer = await peerConnection.createOffer(); // teklif oluşturma
  await peerConnection.setLocalDescription(offer); // teklifi yerel nesneye tanımla

  socket.send(
    JSON.stringify({
      type: "offer",
      offer,
      target: selectedUserID,
      from: currentUserID,
    })
  );
  updateStatus(`${selectedUserID} aranıyor...`);
  startCallButton.classList.add("hidden");
  endCallButton.classList.remove("hidden");
});


// --- Çağrı Bitirme ---
endCallButton.addEventListener("click", () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  socket.send(
    JSON.stringify({
      type: "endCall",
      target: selectedUserID,
      from: currentUserID,
    })
  );

  selectedUserID = null;
  updateStatus("Çağrı sona erdi.");
  startCallButton.classList.remove("hidden");
  endCallButton.classList.add("hidden");
});

(async () => {
  await getLocalStream();
})();
