var socket = io('https://tiktoklive.glitch.me', { });

const tiktok_comment_list = document.getElementById('tiktok-comments-list');
var TIKTOK_CONNECTED = false;
var AUTO_TIKTOK_RECONNECT = true;
var CLIENT_ID = null;

socket.on('disconnect', () => {
  CLIENT_ID = null;
})

socket.on('connect', function() {
  CLIENT_ID = socket.id;
  console.log('connected to server', socket.id);
});

socket.on('alertFromServer', mess => {
  alert(mess);
})

socket.on("tiktokConnected", result => {
  TIKTOK_CONNECTED = result;
});

class RoomInfo {
  constructor(root) {
    this.card = $('<div>', {class:'card shadow-sm'}).appendTo(root);
    this.card_body = $('<div>', {class:'card-body bg-light py-2'}).appendTo(this.card);
    this.card_content = $('<span>').html('<strong><i class="fas fa-info-circle"></i> Thông tin phòng:</strong>').appendTo(this.card_body);
    this.tiktok_status = $('<small>', {class:'ms-3'}).text('Chưa kết nối').appendTo(this.card_content);
    this.time = $('<small>',{class:'ms-3'}).text('Thời lượng: 00:00:00').appendTo(this.card_content);
    this.data = {create_time: new Date().getTime()/1000}
    this.listenSocket();
    this.updateInfo()
    setInterval(()=>{this.updateInfo()},1000);
  }
  
  listenSocket(){
    socket.on("eventConnected", result => {
      console.log(result)
      console.log(result.roomInfo.create_time);
      console.log(result.roomInfo.title);
      console.log(result.roomInfo.owner.nickname);
      console.log(result.roomInfo.owner.follow_info.following_count);
      console.log(result.roomInfo.owner.follow_info.follower_count);
      console.log(result.roomInfo.owner.display_id);
      console.log(result.roomInfo.owner.bio_description);
      console.log(result.roomInfo.owner.avatar_large.url_list[0]);
      this.data.create_time = result.roomInfo.create_time;
    })
  }
  
  updateInfo(){
    if(CLIENT_ID && TIKTOK_CONNECTED){
      this.tiktok_status.text('Đã kết nối').removeClass('text-danger').addClass('text-success');
      
      var a = (new Date().getTime()/1000).toFixed(0) - this.data.create_time;
      var h = parseInt((a/3600), 10);
      var m = parseInt((a%3600)/60, 10);
      var s = parseInt(((a%3600)%60), 10);

      this.time.text(`Thời lượng: ${(h < 10 ? '0':'')+h}:${(m < 10 ? '0':'')+m}:${(s < 10 ? '0':'')+s}`) 
    }
    else{
      this.tiktok_status.text('Chưa kết nối').removeClass('text-success').addClass('text-danger');
    }
  }
}

class UserNameInput {
  constructor(root) {
    this.root = root;
    this.last_username = (localStorage.getItem("lastTiktokUsername") ||'');
    this.input_group = $('<div>', {class:'input-group shadow-sm bg-light'}).appendTo(this.root);
    this.input = $('<input>', {class:'form-control bg-light', type:'text', value:this.last_username, placeholder:'điền username tiktok'}).appendTo(this.input_group);
    this.stop_button = $('<button>', {class:'btn btn-outline-danger w-50', type:'button',style:'display:none'}).text('Dừng').click(() => {this.stopBtnClick()}).appendTo(this.input_group);
    this.start_button = $('<button>', {class:'btn btn-outline-primary w-50 disabled', type:'button', style:'display:unset'}).text('Kết nối').click(() => {this.startBtnClick()}).appendTo(this.input_group);
    this.spinner = $('<div>', {class:'spinner-border spinner-border-sm ms-2', role:'status'}).html('<span class="visually-hidden">Loading...</span>').hide().appendTo(this.start_button);
    this.listenSocket();
  }
  
  startBtnClick(){
    let username = this.input.val().trim();
    if (username) {
      this.formDisplay('connecting');
      socket.emit("TiktokConnectStart", username);
    }
    else {
      alert('username không hợp lệ, vui lòng thử lại');
    }
  }
  
  stopBtnClick(){
    this.stop_button.addClass('disabled');
    setTimeout(()=>{socket.emit("stopTiktokConnection", true);}, 500)
  }
  
  formDisplay(status){
    switch(status){
      case 'connecting':
        this.spinner.show();
        this.start_button.show();
        this.start_button.addClass('disabled');
        this.start_button.appendTo(this.input_group);
        this.stop_button.hide();
        this.input.attr('disabled','true');
        break;
      case 'connected':
        this.start_button.hide();
        this.stop_button.removeClass('disabled');
        this.stop_button.appendTo(this.input_group);
        this.stop_button.show();
        this.input.attr('disabled','true');
        this.input.css('cursor','not-allowed');
        break;
      case 'disconnected':
        this.spinner.hide();
        this.start_button.removeClass('disabled');
        this.start_button.show();
        this.stop_button.hide();
        this.input.removeAttr('disabled');
        this.start_button.appendTo(this.input_group);
        this.input.css('cursor','unset');
        break;
    }
  }
  
  reconnect(){
    console.log(`reconnecting... ${this.input.val().trim()}`)
    this.formDisplay('connecting');
    setTimeout(() => {
      if(CLIENT_ID){
        this.startBtnClick();
      }
      else{ 
        this.reconnect();
      }
    }, 3000)
  }
  
  listenSocket(){
    socket.on('disconnect', () => {
      this.start_button.addClass('disabled');
      if(TIKTOK_CONNECTED){
        this.reconnect();
      }
    })
    
    socket.on('connect', () => {
      if(!TIKTOK_CONNECTED){
        this.start_button.removeClass('disabled');
      }
    })
    
    socket.on("tiktokConnected", result => {
      if(result){
        this.formDisplay('connected');
        localStorage.setItem("lastTiktokUsername", this.input.val().trim());
      }
      else {
        this.formDisplay('disconnected');
      }
    });
    
    socket.on("streamEnd", result => {
      TIKTOK_CONNECTED = false;
      this.formDisplay('disconnected');
      alert('Livestream đã kết thúc');
    });
  }
}

class ChatBoxWidget {
  constructor(root) {
    // this.commentCounter = $('#comments-counter');
    this.defaultAvatar = '/images/placeholder-avatar.jpeg';
    this.totalComment = 0;
    this.commentArray = [['username','comment']];
    
    this.card = $('<div>', {class:'card shadow-sm'}).appendTo(root);
    this.card_header = $('<div>', {class:'card-header bg-light'}).html('<strong><i class="fas fa-comments"></i> Danh sách comments</strong>').appendTo(this.card);
    this.commentCounter = $('<small>',{class:'ms-1'}).text('(0)').appendTo(this.card_header);
    this.downloadBtn = $('<a>',{class:'float-end'}).html('<i class="fa-solid fa-download"></i>').css('cursor', 'pointer').click(()=>{this.download()}).appendTo(this.card_header);
    this.card_body = $('<div>', {class:'card-body bg-light overflow-auto hidden-scrollbar', id:'bjrtgxe'}).css('height','600px').appendTo(this.card);
    this.demo_list = $('<ul>', {class:'list-unstyled'}).appendTo(this.card_body);
    this.commentList = $('<ul>', {class:"px-0"}).appendTo(this.card_body);
    
    for(var i = 0; i <= 15; i++) {
      let list = ['w-50', 'w-75', 'w-100'];
      let width = list[Math.floor(Math.random()*list.length)];
      $('<li>').html(`<div class="bg-white my-2 ${width}">&nbsp</div>`).appendTo(this.demo_list);
    }

    setInterval(()=>{
      let a = document.querySelector(`#${this.card_body.attr('id')}:not(:hover)`);
      try{a.scrollTo({top: 0, behavior: 'smooth'})}catch(r){return}
    },3000);
    
    this.listenSocket();
  }
  
  download(){
    var lineArray = [];
    this.commentArray.forEach(function(infoArray, index) {
        var line = infoArray.join(" \t");
        lineArray.push(index == 0 ? line : line);
    });
    var csvContent = lineArray.join("\r\n");
    console.log(csvContent);

    var blob = new Blob([csvContent],{ type: "application/vnd.ms-excel;charset=utf-8" });
    saveAs(blob, "tiktok-comment.xls");
  }

  listenSocket(){
    socket.on("eventChat", result => {
      this.demo_list.hide();
      this.totalComment += 1;
      this.commentCounter.text(`(${this.totalComment})`);
      let time = new Date(new Date().getTime()+7000*60*60).toISOString().substr(11, 8);
      this.commentArray.push([result.uniqueId, result.comment]);
      
      $('<li>',{class:'py-1 d-flex'}).html(`<img class="tiktok-avatar rounded-circle" width="23" height="23" src="${result.profilePictureUrl || this.defaultAvatar}">
                                              <div class="ms-2">
                                                <small class="tiktok-username"><strong>${result.uniqueId}:</strong></small>
                                                <small class="tiktok-message ms-1">${result.comment}</small>
                                              </div>`).prependTo(this.commentList);
    })
  }
}

class GiftList {
  constructor(root) {
    this.root = root;
    this.defaultAvatar = '/images/placeholder-avatar.jpeg';
    this.card = $('<div>', {class:'card shadow-sm h-100'}).appendTo(this.root);
    this.card_header = $('<div>', {class:'card-header bg-light'}).html('<strong><i class="fas fa-gift"></i> Danh sách donate</strong>').appendTo(this.card);
    this.card_body = $('<div>', {class:'card-body bg-light overflow-auto hidden-scrollbar', id:'qwdaweqads'}).css('height', '480px').appendTo(this.card);
    this.demo_list = $('<ul>', {class:'list-unstyled'}).appendTo(this.card_body);
    this.gift_list = $('<ul>', {class:'list-unstyled'}).appendTo(this.card_body);
    
    for(var i = 0; i <= 10; i++) {
      let list = ['w-50', 'w-75', 'w-100'];
      let width = list[Math.floor(Math.random()*list.length)];
      $('<li>').html(`<div class="bg-white my-2 ${width}">&nbsp</div>`).appendTo(this.demo_list);
    }

    setInterval(()=>{
      let a = document.querySelector(`#${this.card_body.attr('id')}:not(:hover)`);
      try{a.scrollTo({top: 0, behavior: 'smooth'})}catch(r){return}
    },3000);
    
    this.listenSocket();
  }
  
  listenSocket(){
    socket.on("eventGift", result => {
      this.demo_list.hide();
      $('<li>', {class:'py-1 d-flex'}).html(`<img class="tiktok-avatar rounded-circle" width="23" height="23" src="${result.profilePictureUrl || this.defaultAvatar}">
                                              <div class="ms-2">
                                                <small><strong>${result.uniqueId}:</strong></small>
                                                <small class="ms-1"> đã tặng</small>
                                                <img width="23" height="23" src="${result.extendedGiftInfo.icon.url_list[0]}">
                                                <small><strong> x${result.gift.repeat_count}</strong></small>
                                              </div>`).prependTo(this.gift_list);
    })
  }
}

class ViewCountWidget {
  constructor(root) {
    this.current_view_count = 0;
    this.chartData = [1, 5, 4, 7, 8, 15, 6, 7, 9, 20];
    
    this.card = $('<div>', {class:'card shadow-sm'}).appendTo(root);
    this.card_body = $('<div>',{class:'card-body bg-light'}).css('height','100px').appendTo(this.card);
    this.chart = $('<div>', {class:'position-absolute overflow-hidden w-100 h-50 bottom-0 start-0'}).appendTo(this.card_body);
    this.sparkline = $('<span>').appendTo(this.chart);
    this.info = $('<div>').appendTo(this.card_body);
    this.number = $('<h5>', {class:'mb-0'}).text('0').appendTo(this.info);
    this.subtitle = $('<small>').text('Lượt xem').appendTo(this.info);
    
    this.renderChart();
    this.listenSocket();
    $(window).resize(() => {
      this.renderChart()
    });
  }
  listenSocket(){
    socket.on("viewCount", result => {
      this.current_view_count = result.viewerCount;
      this.number.text(result.viewerCount.toLocaleString(undefined,{ minimumFractionDigits: 0 }));
      this.chartData.shift();
      this.chartData.push(result.viewerCount);
      this.renderChart();
    })
  }
  
  renderChart(){
    $(this.sparkline).sparkline(this.chartData, {
        type: 'line',
        lineColor: '#A6A6A6',
        lineWidth: 2,
        fillColor: '#DDDDDD',
        height: 52,
        width: '100%'
    });
  }
}

class GiftCountWidget {
  constructor(root) {
    this.total_diamond = 0;
    this.total_diamond_at_a_time = 0;
    this.chartData = [1,5,4,8,15,9,20,15,10,20];
    
    this.card = $('<div>', {class:'card shadow-sm'}).appendTo(root);
    this.card_body = $('<div>',{class:'card-body bg-light'}).css('height','100px').appendTo(this.card);
    this.chart = $('<div>', {class:'position-absolute w-100 h-50 bottom-0 start-0'}).appendTo(this.card_body);
    this.sparkline = $('<span>').appendTo(this.chart);
    this.info = $('<div>').appendTo(this.card_body);
    this.number = $('<h5>', {class:'mb-0'}).text('0').appendTo(this.info);
    this.subtitle = $('<small>').text('Kim cương').appendTo(this.info);
    
    this.renderChart();
    this.listenSocket();
    this.updateChart();
    $(window).resize(() => {
      this.renderChart()
    });
  }
  
  listenSocket(){
    socket.on("eventGift", result => {
      try{
        this.total_diamond += (result.extendedGiftInfo.diamond_count*result.gift.repeat_count);
        this.total_diamond_at_a_time += (result.extendedGiftInfo.diamond_count*result.gift.repeat_count);
      }
      catch(r){
        console.error(r)
        console.log(result)
      }
    })
  }
  
  updateChart(){
    setInterval(() => {
      if(CLIENT_ID && TIKTOK_CONNECTED){
        this.chartData.shift();
        this.chartData.push(this.total_diamond_at_a_time);
        this.total_diamond_at_a_time = 0;
        this.number.text(this.total_diamond.toLocaleString(undefined,{minimumFractionDigits: 0 }));
        this.renderChart();
      }
    }, 10000);
  }
  
  renderChart(){
    $(this.sparkline).sparkline(this.chartData, {
        type: 'line',
        lineColor: '#A6A6A6',
        lineWidth: 2,
        fillColor: '#DDDDDD',
        height: 52,
        width: '100%'
    });
  }
}

class LikeCountWidget {
  constructor(root) {
    this.total_like_at_a_time = 0;
    this.chartData = [8,1,4,5,9,10,20,8,25,10];
    this.totalLikeCount = 0;
    
    this.card = $('<div>', {class:'card shadow-sm'}).appendTo(root);
    this.card_body = $('<div>',{class:'card-body bg-light'}).css('height','100px').appendTo(this.card);
    this.chart = $('<div>', {class:'position-absolute w-100 h-50 bottom-0 start-0'}).appendTo(this.card_body);
    this.sparkline = $('<span>').appendTo(this.chart);
    this.info = $('<div>').appendTo(this.card_body);
    this.number = $('<h5>', {class:'mb-0'}).text('0').appendTo(this.info);
    this.subtitle = $('<small>').text('Lượt like').appendTo(this.info);
    
    this.renderChart();
    this.listenSocket();
    this.updateChart();
    $(window).resize(() => {
      this.renderChart();
    });
  }
  
  listenSocket(){
    socket.on("eventLike", result => {
      this.total_like_at_a_time += result.likeCount;
      this.totalLikeCount = result.totalLikeCount;
    })
  }
  
  updateChart(){
    setInterval(()=>{
      if(CLIENT_ID && TIKTOK_CONNECTED){
        this.chartData.shift();
        this.chartData.push(this.total_like_at_a_time);
        this.total_like_at_a_time = 0;
        this.number.text(this.totalLikeCount.toLocaleString(undefined,{ minimumFractionDigits: 0 }));
        this.renderChart();
      }
    }, 10000);
  }

  
  renderChart(){
    $(this.sparkline).sparkline(this.chartData, {
        type: 'line',
        lineColor: '#A6A6A6',
        lineWidth: 2,
        fillColor: '#DDDDDD',
        height: 52,
        width: '100%'
    });
  }
}

class FollowCountWidget {
  constructor(root) {
    this.root = root;
    this.card = $('<div>', {class:'card shadow-sm'}).appendTo(root);
    this.card_body = $('<div>',{class:'card-body bg-light'}).css('height','100px').appendTo(this.card);
    this.chart = $('<div>', {class:'position-absolute w-100 h-50 bottom-0 start-0'}).appendTo(this.card_body);
    this.sparkline = $('<span>').appendTo(this.chart);
    this.info = $('<div>').appendTo(this.card_body);
    this.number = $('<h5>', {class:'mb-0'}).text('0').appendTo(this.info);
    this.subtitle = $('<small>').text('Lượt follow').appendTo(this.info);
    
    this.chartData = [20,10,6,4,8,15,30,10,4,7];
    this.totalFollower = 0;
    this.newFollowAtTime = 0;
    this.totalNewFollow = 0;
    this.renderChart();
    this.listenSocket();
    this.updateChart();
    $(window).resize(() => {
      this.renderChart();
    });
  }
  
  renderChart(){
    $(this.sparkline).sparkline(this.chartData, {
        type: 'line',
        lineColor: '#A6A6A6',
        lineWidth: 2,
        fillColor: '#DDDDDD',
        height: 52,
        width: '100%'
    });
  }
  
  updateChart(){
    setInterval(()=>{
      if(CLIENT_ID && TIKTOK_CONNECTED){
        this.chartData.shift();
        this.chartData.push(this.newFollowAtTime);
        this.newFollowAtTime = 0;
        this.number.text(this.totalFollower.toLocaleString(undefined,{ minimumFractionDigits: 0 }));
        this.renderChart();
      }
    }, 10000);
  }
  
  listenSocket(){
    socket.on("eventConnected", result => {
      this.totalFollower = result.roomInfo.owner.follow_info.follower_count;
    });
    socket.on("eventFollow", result => {
      this.newFollowAtTime += 1;
      this.totalNewFollow += 1;
      this.totalFollower += 1
    })
  }
}

class CommentPieChart {
  constructor(root) {
    this.data = {
      comment:[{
        label:' Not follower',
        value:1,
        color:'#36a2eb'
      },{
        label:' Follower',
        value:1,
        color:'#fd9f40'
      },{
        label:' Friend',
        value:1,
        color:'#fb6384'
      }],
      dolate:[{
        label:' Not follower',
        value:1,
        color:'#36a2eb'
      },{
        label:' Follower',
        value:1,
        color:'#fd9f40'
      },{
        label:' Friend',
        value:1,
        color:'#fb6384'
      }]
    };
    this.chart;
    
    this.card = $('<div>', {class:'card shadow-sm'}).appendTo(root);
    this.card_header = $('<div>', {class:'card-header bg-light'}).html('<strong>Tỉ lệ người xem</strong> <small>(comment & donate)</small>').appendTo(this.card);
    this.card_body = $('<div>', {class:'card-body bg-light'}).appendTo(this.card);
    this.canvas = $('<canvas>',{class:''}).appendTo(this.card_body);
    this.context = this.canvas[0].getContext('2d');
    
    this.renderChart();
    this.listenSocket();
    setInterval(()=>{
      this.updateChart()
    }, 10000);
  }
  
  renderChart(){
    this.chart = new Chart(this.context, {
        type: 'pie',
        data: {
          labels: $.map(this.data.comment, function(v, k){return v.label}),
          datasets: [{
            label: "comment",
            backgroundColor: $.map(this.data.comment, function(v, k){return v.color}),
            data: $.map(this.data.comment, function(v, k){return v.value})
          },{
            label: "donate",
            backgroundColor: $.map(this.data.dolate, function(v, k){return v.color}),
            data: $.map(this.data.dolate, function(v, k){return v.value})
          }]
        },
        options: {
          title: {
            display: false,
            text: 'Predicted world population (millions) in 2050'
          }
        }
    });
  }
  
  updateChart(){
    if(CLIENT_ID && TIKTOK_CONNECTED){
      this.chart.data.datasets[0].data = $.map(this.data.comment, function(v, k){return v.value - 1});
      this.chart.data.datasets[1].data = $.map(this.data.dolate, function(v, k){return v.value - 1});
      this.chart.update();
    }
  }
  
  listenSocket(){
    socket.on("eventChat", result => {
      this.data.comment[result.followRole].value += 1;
    })
    socket.on("eventGift", result => {
      this.data.dolate[result.followRole].value += 1;
    })
  }
}

class SettingModalBtn{
  constructor(root){
    // this.button = $('<button>',{class:'btn btn-outline-primary ms-2 float-end'}).html('<span class="d-none d-md-inline">Cài đặt</span> <i class="fas fa-cog"></i>').appendTo(root);
    // this.button.click(this.showModal);
  }
  
  showModal(){
    alert('ok');
  }
}
// class CommentsFilter{
//   constructor(root){
//     this.card = $('<div>', {class:'card shadow-sm'}).appendTo(root);
//     this.card_header = $('<div>', {class:'card-header bg-light'}).html('<strong>Bộ lọc comment</strong>').appendTo(this.card);
//     this.card_body = $('<div>',{class: 'card-body bg-light'}).appendTo(this.card);
//     this.tools_bar = $('<div>', {class:'d-flex'}).appendTo(this.card_body);
//     this.keywords = $('<small>', {class:'d-flex my-auto'}).html('<strong>Từ khoá: </strong> <span class="ms-2">abc</span>').appendTo(this.tools_bar);
//     this.addKeywordBtn = $('<button>', {class:'btn btn-sm btn-outline-primary ms-2 float-right'}).text('thêm từ khoá').appendTo(this.tools_bar);
//   }
// }