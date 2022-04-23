const { WebcastPushConnection } = require('tiktok-livestream-chat-connector')
const ProxyAgent = require('proxy-agent')
const googleTTS = require('google-tts-api') // CommonJS

// Firestore
const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./firestore/serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

//EXPRESS
var express = require('express') 
var app = express()
var server = app.listen(process.env.PORT || 3000)
const path = require('path')

app.use(express.static('public'))
app.use(express.json())       // to support JSON-encoded bodies
app.use(express.urlencoded()) // to support URL-encoded bodies

console.log('server running')

//SOCKET
var socket = require('socket.io')
var io = socket(server, {
  cors: {
    origin: '*',
  }
})

app.get('/tiktok-live-chat', function (req, res) {
   // res.send('Chốt đơn Tiktok')
  res.sendFile(path.join(__dirname, '/public/tiktok-live-chat.html'))
})

app.get('/login', function (req, res) {
   // res.send('Chốt đơn Tiktok')
  res.sendFile(path.join(__dirname, '/public/login.html'))
})

app.post('/login', function (req, res) {
  console.log(req.body)
   res.status(200).send(`${req.body}`)
})

app.get('/register', function (req, res) {
   // res.send('Chốt đơn Tiktok')
  res.sendFile(path.join(__dirname, '/public/register.html'))
})

app.get('/forgot', function (req, res) {
   // res.send('Chốt đơn Tiktok')
  res.sendFile(path.join(__dirname, '/public/forgot.html'))
})

app.get('/reset', function (req, res) {
   // res.send('Chốt đơn Tiktok')
  res.sendFile(path.join(__dirname, '/public/reset.html'))
})

app.get('/undefined', function (req, res) {
   res.send('Chốt đơn Tiktok')
})


function handleError(err, response) {
  response.status(500);
  response.send(
    "<html><head><title>Internal Server Error!</title></head><body><pre>"
    + JSON.stringify(err, null, 2) + "</pre></body></pre>"
  );
}

app.post('/speech', function (req, res) {
   googleTTS
    .getAudioBase64(req.body.text, {
      lang: req.body.lang,
      slow: Boolean(req.body.slow != 'false'),
      host: 'https://translate.google.com',
      timeout: 10000,
    })
    .then(base64sound => {
     res.status(200).send(base64sound)
   })
    .catch(error => {
      res.status(500).send(`Lỗi gTTS: ${error}`)
   })
})


class tiktokLive{
  constructor(uid, cliendId){
    this.uid = uid
    this.cliend_id = cliendId
    this.tiktok = new WebcastPushConnection(this.uid, {
      // 'requestOptions': {
      //   httpsAgent: new ProxyAgent('https://41.65.251.86:1981'),
      //   timeout: 10000 // 10 seconds 
      // },
      'requestPollingIntervalMs': 1000,
      'enableExtendedGiftInfo':true,
      'processInitialData':false
    })
    this.listen()
  }
  connect(callback){
    this.tiktok.connect().then(state => {
      return callback(true)
    }).catch(err => {
      return callback(false, err.message)
    })
  }
  disconnect(){
    this.tiktok.disconnect()
  }
  listen(){
// Control Events
    this.tiktok.on('connected', state => {
      console.log(state.roomInfo.owner.bio_description)
      io.to(this.cliend_id).emit('eventConnected', state)
    })
    this.tiktok.on('disconnected', () => {
      console.log('disconnected', this.uid)
      io.to(this.cliend_id).emit('tiktokDisconnected', true)
    })
    this.tiktok.on('streamEnd', () => {
      console.log('streamEnd')
      io.to(this.cliend_id).emit('streamEnd', true)
    })
    this.tiktok.on('websocketConnected', websocketClient => {
      console.log("Websocket:", websocketClient.connection);
    })
    this.tiktok.on('error', err => {
      console.error('Error!', err);
    })
    this.tiktok.on('rawData', (messageTypeName, binary) => {
    // console.log(messageTypeName, binary);
    })
    
// Message Events
    this.tiktok.on('member', data => {
      // console.log(`${data.uniqueId} joins the stream!`)
    })
    this.tiktok.on('chat', data => {
      io.to(this.cliend_id).emit('eventChat', data)
      // console.log(`${data.uniqueId} writes: ${data.comment}`)
    })
    this.tiktok.on('gift', data => {
      if(data.gift && data.gift.gift_type == 1 && data.gift.repeat_end == 1){
        io.to(this.cliend_id).emit('eventGift', data)
      }
      else if (data.gift && data.gift.gift_type != 1){
        io.to(this.cliend_id).emit('eventGift', data) 
      }
    })
    this.tiktok.on('roomUser', data => {
      io.to(`${this.cliend_id}`).emit('viewCount', data)
    })
    this.tiktok.on('like', data => {
      io.to(this.cliend_id).emit('eventLike', data)
    })
    this.tiktok.on('social', data => {
      if(data.label.includes("followed")){
        io.to(this.cliend_id).emit('eventFollow', data)
      }
      else if(data.label.includes("shared")){
        // io.to(this.cliend_id).emit('eventShare', data)
      }
    })
    this.tiktok.on('questionNew', data => {
      // console.log(`${data.uniqueId} asks ${data.questionText}`)
    })
    this.tiktok.on('linkMicBattle', (data) => {
      // console.log(`New Battle: ${data.battleUsers[0].uniqueId} VS ${data.battleUsers[1].uniqueId}`)
    })
    this.tiktok.on('linkMicBattle', (data) => {
      // console.log(`New Battle: ${data.battleUsers[0].uniqueId} VS ${data.battleUsers[1].uniqueId}`)
    })
    this.tiktok.on('liveIntro', (msg) => {
      // console.log(msg)
    })
  }
}

io.sockets.on('connection', (socket) => {
  console.log(`Kết nối socket mới, ID: ${socket.id}`)
  
  socket.on('disconnect', reason => {
    console.log('Mất kết nối client', socket.id, reason)
  })
  socket.on('latency', function (startTime, cb) {
    cb(startTime)
  })
  socket.on('TiktokConnectStart', (uid) => {
    let tiktok_live = new tiktokLive(uid, socket.id)
    tiktok_live.connect(function(res, mess){
      if(res){
        console.log('connected', uid)
        io.to(socket.id).emit('tiktokConnected', true)
      } else {
        io.to(socket.id).emit('tiktokConnected', false)
        io.to(socket.id).emit('alertFromServer', mess)
        console.log('connect error', mess)
      }
    })
    socket.on('disconnect', () => {
      tiktok_live.disconnect()
    })
    socket.on('stopTiktokConnection', () => {
      tiktok_live.disconnect()
      io.to(socket.id).emit('tiktokConnected', false)
    })
  })
})




