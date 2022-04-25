// OK 
const { WebcastPushConnection } = require('tiktok-livestream-chat-connector')
const ProxyAgent = require('proxy-agent')
const googleTTS = require('google-tts-api') // CommonJS
const nodemailer =  require('nodemailer')
const path = require('path')
const cookieParser = require('cookie-parser')

//EXPRESS
const express = require('express') 
const app = express()
const server = app.listen(process.env.PORT || 3000)
app.use(express.static('public'))
app.use(express.json())       // to support JSON-encoded bodies
app.use(express.urlencoded()) // to support URL-encoded bodies
app.use(cookieParser())
app.set('views', __dirname + '/views');
app.engine('html', require('ejs').renderFile)

//SOCKET
const socket = require('socket.io')
const io = socket(server, {
  cors: {
    origin: '*',
  }
})

// FIRESTORE
const { initializeApp, applicationDefault, cert } = require('firebase-admin/app')
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore')
const serviceAccount = require('./firestore/serviceAccountKey.json')
initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore()

const EMAIL_VALID_CODE = {}
const RESET_VALID_CODE = {}
const USER_COOKIES = {}

console.log('server running')

app.get('/', function (req, res) {
  res.render(path.join(__dirname, '/public/home.html'), {isLogin:isLogin(req)})
})

app.get('/login', function (req, res) {
  if(isLogin(req)) res.clearCookie('TTT_COOKIE').redirect('/')
  else{res.sendFile(path.join(__dirname, '/public/login.html'))}
})
app.post('/login', function (req, res) {
  let email = req.body.email,
      password = req.body.password
  
  db.collection('accounts').doc(email).get().then(account => {
    if (!account.exists) {
      res.json({error:true,redirect:false,mess:'Tài khoản không tồn tại'})
    } else if (account.data().password != password) {
      res.json({error:true,redirect:false,mess:'Mật khẩu không đúng'})
    } else {
      let cookie = makeid(12)
      USER_COOKIES[cookie] = account.data()
      res.cookie('TTT_COOKIE', cookie).json({error:false,redirect:'/',mess:'Đăng nhập thành công'})
    }
  });
})

app.get('/register', function (req, res) {
  if(isLogin(req)){res.clearCookie('TTT_COOKIE').redirect('/')}
  else{res.sendFile(path.join(__dirname, '/public/register.html'))}
})
app.post('/register', function(req, res) {
  if(!req.body.name || !req.body.email || !req.body.validcode || !req.body.password) res.json({error:true,redirect:false,mess:'Thông tin đăng ký không hợp lệ'})

  if(EMAIL_VALID_CODE[req.body.email] == req.body.validcode){
    createAccount(req.body.name, req.body.email, req.body.password, function(account){
      if(account) {
        let cookie = makeid(12)
        USER_COOKIES[cookie] = account
        res.cookie('TTT_COOKIE', cookie).json({error:false,redirect:'/',mess:'Đăng ký thành công'})
      }
    })
  } else {
    res.json({error:true,redirect:false,mess:'Mã xác minh không chính xác'})
  }
})

app.get('/forgot', function (req, res) {
  if(isLogin(req)){res.redirect('/')}
  else{res.render(path.join(__dirname, '/public/forgot.html'))}
})
app.post('/forgot', function (req, res) {
  if(!req.body.email || !req.body.hostname){
    res.json({error:true,redirect:false, mess:'Email không hợp lệ'})
  }
  findAccount(req.body.email, available => {
    if(!available){
      res.json({error:true,redirect:false, mess:'Email không tồn tại'})
      // res.status(400).send({redirect:false,mess:'Email không tồn tại'})
    } else {
      let validcode = makeid(20)
      let email = req.body.email,
      subject = 'Đặt lại mật khẩu',
      text = 'Yêu cầu đặt lại mật khẩu',
      html = '<p>Đường dẫn đặt lại mật khẩu</p>'+
      `<a href="https://${req.body.hostname}/reset?code=${validcode}">https://${req.body.hostname}/reset?code=${validcode}<a>`

      sendMail(email, subject, text, html, success => {
        if(!success){
          res.json({error:true,redirect:false, mess:'Lỗi khi gửi link đặt lại'})
        } else {
          RESET_VALID_CODE[validcode] = email
          console.log('Mã đặt lại mật khẩu mới:', validcode, email)
          res.json({error:false,redirect:'/', mess:'Đã gửi link đặt lại, vui lòng kiểm tra email'})
        }
      })
    }
  })
})

app.get('/reset', function (req, res) {
  if(isLogin(req)){res.redirect('/')}
  else{
    let code = req.query.code
    let email = RESET_VALID_CODE[code]
    if(!email){res.redirect('/forgot')}
    else{res.render(path.join(__dirname, '/public/reset.html'), {email:email||'', code:code})}
  }
})
app.post('/reset', function (req, res) {
  let code = req.body.code
  let password = req.body.password
  let email = RESET_VALID_CODE[code]
  if(!code || !password || !email) res.json({error:true,redirect:false,mess:'thông tin không hợp lệ'})
  else{
    db.collection('accounts').doc(email).update({password: password})
    .then( function(){
      let subject = 'Mật khẩu đã được đặt lại',
      text = 'Mật khẩu đã được đặt lại',
      html = `<p>Mật khẩu mới của bạn là: ${password}</p>`
      sendMail(email, subject, text, html, success => {})
      
      res.json({error:false,redirect:'/login',mess:'Đã đặt lại mật khẩu'})

    }).catch(error => {
      res.json({error:true,redirect:false,mess:'Đặt lại không thành công'})
    })
  }
})

app.get('/undefined', function (req, res) {
   res.status(200).send('Chốt đơn Tiktok')
})

app.post('/validate-email', function(req, res) {
  let validcode = Math.floor(1000 + Math.random() * 9000)
  let email = req.body.email
  findAccount(email, avainable => {
    if(avainable){
      res.json({error:true,mess:'Email đã được sử dụng'})
    } else {
      let email = req.body.email,
      subject = 'Xác nhận đăng ký',
      text = 'Mã xác minh của bạn là: '+validcode,
      html = '<p>Bạn nhận được email này do địa chỉ email của bạn được dùng để đăng ký tài khoản tại ...</p>'+
      '<p>Nếu hành động đó không phải do bạn thực hiện, bạn có thể bỏ qua email này.</p>'+
      `<p>Mã xác minh của bạn là <strong>${validcode}</strong><p>`

      sendMail(email, subject, text, html, success => {
        if(success){
          EMAIL_VALID_CODE[req.body.email] = validcode
          console.log('Mã xác nhận email mới:', validcode, email)
          res.json({error:false,mess:'Đã gửi mã xác minh, vui lòng kiểm tra email'})
        } else {
          res.json({error:true,mess:'Lỗi khi gửi mã xác minh'})
        }
      })
    }
  })
});

app.get('/tiktok-live-chat', function (req, res) {
  res.render(path.join(__dirname, '/public/tiktok-live-chat.html'), {isLogin:isLogin(req)})
})

async function findAccount(email, callback){
  let account = await db.collection('accounts').doc(email).get()
  if (account.exists) {
    return callback(true)
  } else {
    return callback(false)
  }
}

async function createAccount(name, email, password, callback){
  let data = {
    name: name,
    password: password
  }
  await db.collection('accounts').doc(email).set(data).then( function(res){
    return callback(data)
  })
}

function makeid(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * 
 charactersLength));
   }
   return result;
}
function isLogin(req){
  if(USER_COOKIES[req.cookies.TTT_COOKIE]){
    return true;
  } else {
    return false
  }
}
async function sendMail(to, subject, text, html, callback){
  var transporter =  nodemailer.createTransport({ // config mail server
    service: 'Gmail',
    auth: {
      user: 'tiktokliveapp@gmail.com',
      pass: 'Quang112485961'
    }
  });
  var mainOptions = { // thiết lập đối tượng, nội dung gửi mail
    from: 'Tiktok live app',
    to: to,
    subject: subject,
    text: text,
    html: html
  }
  transporter.sendMail(mainOptions, function(err, info){
    if (err) {
      return callback(false)
    } else {
      return callback(true)
    }
  });
}
function speechBase64(text, lang, slow, callback){
  googleTTS.getAudioBase64(text, {
    lang: lang,
    slow: Boolean(slow != 'false'),
    host: 'https://translate.google.com',
    timeout: 10000,
  })
  .then(base64sound => {
   return callback(base64sound)
  })
  .catch(error => {
    return callback(false)
  })
}
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
  
  let cookie = socket.handshake.headers['cookie']
  let ttt_cookie = cookie.match(/(?<=TTT_COOKIE=)[\d\w]{12}/g)
  if(ttt_cookie){
    console.log(USER_COOKIES[ttt_cookie[0]])
  }
  
  socket.on('disconnect', reason => {
    console.log('Mất kết nối client', socket.id, reason)
  })
  socket.on('latency', function (startTime, cb) {
    cb(startTime)
  })
  socket.on('speech', (text, lang, slow, callback) => {
    speechBase64(text, lang, slow, base64sound => {
      callback(base64sound)
    })
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