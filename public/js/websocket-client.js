var socket = io()

socket.on('connected', function(mess){
  console.log('Server:', mess)
})
