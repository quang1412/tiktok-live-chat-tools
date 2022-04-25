$(function(){
  const socket = io();

  const tiktok_comment_list = document.getElementById('tiktok-comments-list');
  var TIKTOK_CONNECTED = false;
  var AUTO_TIKTOK_RECONNECT = true;
  var CLIENT_ID = null;

  if(!localStorage.getItem('setting')){
    localStorage.setItem('setting', JSON.stringify({
      tts_lang:'vi',
      tts_comment_read: false,
      tts_donate_read: false,
      tts_delay: 1000,
      tts_volume: 1,
      tts_slow: false,
      tts_thank_donate_structure : 'Thank {uid} for {diamond} diamonds',
      tts_comment_structure:'{uid}: {commnent}',
      tts_replace_default_uid: '',
      comment_keywords: []
    }));
  }

  var SETTING = JSON.parse(localStorage.getItem('setting'));

  socket.on('disconnect', () => {
    CLIENT_ID = null;
  })

  socket.on('connect', function() {
    CLIENT_ID = socket.id;
    console.log('connected to server');
    socket.emit('cookie', () => {
      
    })
  });

  socket.on('alertFromServer', mess => {
    alert(mess);
  })

  socket.on("tiktokConnected", result => {
    TIKTOK_CONNECTED = result;
  });

  function createThankDonate(data){
      return SETTING.tts_thank_donate_structure.replace('{uid}', fixNickname(data.uniqueId)).replace('{nickname}', fixNickname(data.nickname)).replace('{giftname}', data.extendedGiftInfo.name)
        .replace('{giftcount}', data.gift.repeat_count).replace('{diamond}', data.extendedGiftInfo.diamond_count*data.gift.repeat_count)
  }

  function createCommentTts(data){
    let comment = fixComment(data.comment)
    let uniqueId = fixNickname(data.uniqueId)
    let nickname = data.nickname || uniqueId
    if(comment){
      if(SETTING.tts_comment_structure){
        return SETTING.tts_comment_structure.replace('{uid}', uniqueId).replace('{nickname}', nickname).replace('{comment}', comment)
      } else {
        return uniqueId+'. '+comment
      }
    } else {
      return null
    }
  }

  function fixNickname(nickname){
    if(/user\d{10,}/g.test(nickname) && SETTING.tts_replace_default_uid){
      console.log(nickname);
      return SETTING.tts_replace_default_uid;
    }
    else {
      return nickname.replace('_', ' ').replace('.', ' ');
    }
  }

  function fixComment(content){
    return content.toLowerCase()
      .replace(' k ',' không ').replace(' ko ',' không ').replace(' hok ',' không ')
      .replace(' c ',' chị ').replace(' chj ',' chị ').replace(' a ',' anh ').replace(' e ',' em ')
      .replace(' j ',' gì ').replace(' đc ', ' được ').replace(' r ', ' rồi ').replace(' ib ',' inbox ')
      .replace(' vn ',' việt nam ').replace(' ng ',' người ')
      .replace(/(.)\1{5,}/g,'')
      .replace(/[^\p{L}\p{N}\p{P}\p{Z}^$\n]/gu, '')
  }

  function downloadExcel(array){
    var lineArray = [];
    array.forEach(function(infoArray, index) {
        var line = infoArray.join(" \t");
        lineArray.push(index == 0 ? line : line);
    });
    var csvContent = lineArray.join("\r\n");
    console.log(csvContent);

    var blob = new Blob([csvContent],{ type: "application/vnd.ms-excel;charset=utf-8" });
    saveAs(blob, "tiktok-comment.xls");
  }

  function checkKeyword(comment, callback){
    var keycheck = false;
    var phonecheck = /((((\+|)84)|0)(3|5|7|8|9)+([0-9]{8})\b)/.test(comment);
    if(SETTING.comment_keywords.length){
      var re = `(${SETTING.comment_keywords.join(')|(')})`;
      var regex = new RegExp(re, "g");
      var keycheck = regex.test(comment.toLowerCase()); 
    }
    return callback(phonecheck||keycheck);
  }
  class modalConfirm{
    constructor(){
      this.result = 0;
      this.modal = $('#confirm-modal');
      this.modal_title = $('#myModalLabel');
      this.yes_btn = $('#modal-btn-yes');
      this.yes_btn.click(()=>{this.result = 1});
      this.no_btn = $('#modal-btn-no');
      this.no_btn.click(()=>{this.result = 0});
      this.modal.on('shown.bs.modal', (e) => {
        setTimeout(()=>{this.yes_btn.focus()},50);
      });
    }
    confirm(title, callback){
      this.result = 0;
      this.modal_title.text(title);
      this.modal.modal('show');
      this.yes_btn.focus();
      this.modal.on('hidden.bs.modal', ()=>{
        this.modal.off('hidden.bs.modal');
        setTimeout(()=>{return callback(this.result);},50);
      })
    }
  }
  const confirmModal = new modalConfirm()

  class TTS{
    constructor(){
      this.queue_list = [];
      this.speaking = false
      this.speech = new Audio('/sounds/notif-sound.mp3');;
      this.listenSocket();
      this.speak();
    }
    
    listenSocket(){
      socket.on("eventChat", result => { 
        if(SETTING.tts_comment_read){
          let nickname = result.nickname || fixNickname(result.uniqueId);
          let content = createCommentTts(result)
          if(content){
            this.queue_list.push({type:'comment', content: content});
          }
        }
      });
      
      socket.on("eventGift", result => {
        if(SETTING.tts_donate_read){
          this.queue_list.push({type:'donate', content:fixComment(createThankDonate(result))});
        }
      });
      socket.on("tiktokConnected", success => {
        this.queue_list = [];
      });
    }
    resetQueue(){
      this.queue_list = [];
    }
    speak(){
      if(TIKTOK_CONNECTED && CLIENT_ID && this.queue_list.length && !this.speaking){
        let job = this.queue_list.pop();
        if((job.type == 'comment' && !SETTING.tts_comment_read) || 
          (job.type == 'donate' && !SETTING.tts_donate_read)){
          this.queue_list = this.queue_list.filter((j) =>{if(j.type != job.type){return j;}});
          this.speak()
        }
        else{
          this.speaking = true

          socket.emit('speech', job.content, SETTING.tts_lang, SETTING.tts_slow, base64sound => {
            if (base64sound) {
              this.speech = new Audio("data:audio/x-wav;base64," + base64sound);
              this.speech.volume = SETTING.tts_volume;
              this.speech.play();
              this.speech.onended = () => {
                this.speaking = false
              }
            } else {
              this.speaking = false
              this.speak();
            }
          });

          // $.post("/speech", {text: job.content, lang: SETTING.tts_lang, slow: SETTING.tts_slow})
          // .done(data => {
          //   this.speech = new Audio("data:audio/x-wav;base64," + data);
          //   this.speech.volume = SETTING.tts_volume;
          //   this.speech.play();
          //   this.speech.onended = () => {
          //     this.speaking = false
          //   }
          // })
          // .fail( (xhr, textStatus, errorThrown) => {
          //   console.error(xhr.responseText);
          //   this.speaking = false
          //   this.speak();
          // });
        }
      }
      setTimeout(()=>{
        this.speak();
      },SETTING.tts_delay)
    }
  }
  const textToSpeech = new TTS();

  class RoomInfo {
    constructor(root) {
      this.card = $('<div>', {class:'card shadow-sm'}).appendTo(root);
      this.card_body = $('<div>', {class:'card-body bg-light py-2'}).appendTo(this.card);
      this.card_content = $('<span>').html('<strong><i class="fas fa-info-circle"></i> Thông tin phòng:</strong>').appendTo(this.card_body);
      this.pingtime = $('<small>', {class:'ms-3'}).html('<span>Server ping:</span> <span>N/A</span>').appendTo(this.card_content);
      this.time = $('<small>',{class:'ms-3'}).text('Thời lượng: 00:00:00').appendTo(this.card_content);
      this.data = {create_time: new Date().getTime()/1000};
      this.ping = 0;
      this.listenSocket();
      this.updateInfo();
      var pingtime = new Date().getTime();
      setInterval(()=>{
        this.updateInfo();
      },1000);
      setInterval(()=>{
        socket.emit('latency', Date.now(), startTime => {
          var latency = Date.now() - startTime;
          this.pingtime.children().last().text(`${(latency/1000).toFixed(1)}s`);
        });
      },5000);
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
      });
      socket.on('disconnect', () => {
        this.pingtime.children().last().text('N/A');
      });
    }
    updateInfo(){
      if(CLIENT_ID && TIKTOK_CONNECTED){
        var a = (new Date().getTime()/1000).toFixed(0) - this.data.create_time;
        var h = parseInt((a/3600), 10);
        var m = parseInt((a%3600)/60, 10);
        var s = parseInt(((a%3600)%60), 10);

        this.time.text(`Thời lượng: ${(h < 10 ? '0':'')+h}:${(m < 10 ? '0':'')+m}:${(s < 10 ? '0':'')+s}`)
      }
      else{
        
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
      setTimeout(()=>{socket.emit("stopTiktokConnection");}, 500)
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
      });
      
      socket.on('connect', () => {
        if(!TIKTOK_CONNECTED){
          this.start_button.removeClass('disabled');
        }
      });
      
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
      this.match_cmt_sound = new Audio('/sounds/notif-sound.mp3');
      // this.notif_sound_busy = false;
      
      this.card = $('<div>', {class:'card shadow-sm'}).css('height','640px').appendTo(root);
      this.card_header = $('<div>', {class:'card-header bg-light'}).html('<strong><i class="fas fa-comments"></i> Danh sách comments</strong>').appendTo(this.card);
      this.dropdown_btn = $('<a>', {class:'', id:'chatboxDropdownMenu', type:'button', 'data-bs-toggle':'dropdown', 'aria-expanded':'false'}).html('<i class="fs-5 fas fa-bars"></i>');
      this.dropdown_menu = $('<ul>',{class:'dropdown-menu dropdown-menu-end', 'aria-labelledby':'chatboxDropdownMenu'});
      this.download_all_btn = $('<li>').html('<a class="dropdown-item" href="javascript:void(0)">Download toàn bộ cmt</a>').click(()=>{downloadExcel(this.commentArray)}).appendTo(this.dropdown_menu);
      this.download_filted_btn = $('<li>').html('<a class="dropdown-item" href="javascript:void(0)">Download cmt đã khớp</a>').appendTo(this.dropdown_menu);
      $('<li><hr class="dropdown-divider"></li>').appendTo(this.dropdown_menu);
      $('<div>', {class:'dropdown float-end'}).append(this.dropdown_btn, this.dropdown_menu).appendTo(this.card_header);
      this.commentCounter = $('<small>',{class:'ms-1'}).text('(0)').appendTo(this.card_header);
      this.card_body = $('<div>', {class:'card-body bg-light overflow-auto hidden-scrollbar', id:'bjrtgxe'}).appendTo(this.card);
      this.demo_list = $('<ul>', {class:'list-unstyled'}).appendTo(this.card_body);
      this.commentList = $('<ul>', {class:"px-0"}).appendTo(this.card_body);
      this.card_footer = $('<div>', {class:'card-footer bg-light overflow-auto hidden-scrollbar'}).css({'min-height':'41px',height:'41px',transition:'all .5s'}).appendTo(this.card);
      this.keyword_list = $('<div>',{class:'cmt-keyword-list'}).html('<span class="cmt-keyword-item">{phone}</span>').appendTo(this.card_footer);
      
      this.keyword_input = $('<input>',{id:'cmt-keyword-input',placeholder:'thêm từ khoá'}).prependTo(this.keyword_list);
      this.keyword_input.keypress(e => {
        if (e.which == 27) {
          e.currentTarget.value = null;
          return false;
        }
        else if (e.which == 13) {
          let keyword = e.currentTarget.value.trim().toLowerCase();
          if (keyword == null || keyword == "" || SETTING.comment_keywords.indexOf(keyword) >= 0) {return false;} 
          else {
            SETTING.comment_keywords.push(keyword);
            localStorage.setItem('setting',JSON.stringify(SETTING))
            this.addKeyword(keyword);
          }
          e.currentTarget.value = null;
          return false;
        }
      });
      $.each(SETTING.comment_keywords, (i, keyword) => {
        this.addKeyword(keyword);
      });
      this.card_footer.hover((e)=>{
        this.card_footer.css('min-height', '50%');
        this.keyword_input.focus();
      },(e)=>{
        this.card_footer.css('min-height', '41px');
        this.keyword_input.val(null);
        $(':focus').blur()
      })
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
    listenSocket(){
      socket.on("eventChat", result => {
        result.comment = result.comment.toLowerCase();
        this.demo_list.hide();
        this.totalComment += 1;
        this.commentCounter.text(`(${this.totalComment})`);
        // let time = new Date(new Date().getTime()+7000*60*60).toISOString().substr(11, 8);
        this.commentArray.push([result.uniqueId, result.comment]);
        $.get(result.profilePictureUrl);
        let cmt_item = $('<li>',{class:'p-1 d-flex'}).html(`<img class="tiktok-avatar rounded-circle" width="23" height="23" src="${result.profilePictureUrl || this.defaultAvatar}">
        <div class="ms-2">
        <small class="tiktok-username"><strong>${result.uniqueId}:</strong></small>
        <small class="tiktok-message ms-1">${result.comment}</small>
        </div>`).prependTo(this.commentList);
        checkKeyword(result.comment, match => {
          if(match){
            cmt_item.addClass('matched-keyword-cmt');
            if(this.match_cmt_sound.paused){
              this.match_cmt_sound.play(); 
            }
          }
        });
      })
    }
    addKeyword(keyword){
      let key_item = $('<span>',{class:'cmt-keyword-item'}).text(keyword).insertAfter(this.keyword_input);
      $('<a>').html(' <i class="remove-item far fa-times-circle"></i>').click(()=>{this.removeKeyword(key_item)}).appendTo(key_item)
    }
    removeKeyword(item){
      this.card_footer.addClass('freez');
      let key = item.text().trim();
      confirmModal.confirm(`Bạn có chắc chắn xoá từ khoá {${key}} không?`, confirm => {
        this.card_footer.removeClass('freez');
        if(confirm){
          SETTING.comment_keywords.splice(SETTING.comment_keywords.indexOf(key), 1);
          localStorage.setItem('setting',JSON.stringify(SETTING));
          item.remove();
        }
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
      this.card_header = $('<div>', {class:'card-header bg-light'}).html('<strong><i class="fas fa-chart-pie"></i> Tỉ lệ người xem</strong> <small>(comment & donate)</small>').appendTo(this.card);
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

  class SettingModal{
    constructor(root){
      this.modal = root;
      
      this.modal.on('show.bs.modal', event => {
        this.modalShow();
      });
      this.modal.on('hidden.bs.modal', event => {
        this.modalHide();
        this.modal.find('.collapse').removeClass('show')
      });
      $('#setting-save-btn').click(()=>{
        this.modalSave();
      });
    }
    
    modalShow(){
      $.each(SETTING, (key, val) => {
        $(`select[data-setting="${key}"]`).val(val).change();
        $(`input[data-setting="${key}"][type="checkbox"]`).prop('checked', val);
        $(`input[data-setting="${key}"][type="range"], input[data-setting="${key}"][type="text"]`).val(val);
      })
    };
    
    modalHide(){
      return
    };
    
    modalSave(){
      textToSpeech.resetQueue()
      
      $('#setting-modal input[type="checkbox"]').each((i, e) => {
        SETTING[$(e).attr('data-setting')] = $(e).is(":checked");
      });
      
      $('#setting-modal input[type="range"], #setting-modal input[type="text"], #setting-modal select').each((i, e) => {
        SETTING[$(e).attr('data-setting')] = $(e).val();
      })

      localStorage.setItem('setting', JSON.stringify(SETTING));
    };
  }

  $(document).ready(function(){
    new UserNameInput($('#user-name-input'));
    new ChatBoxWidget($('#tiktok_comments_widget'));
    new ViewCountWidget($('#tiktok_view_count_widget'));
    new GiftCountWidget($('#tiktok_diamond_count_widget'));
    new LikeCountWidget($('#tiktok_like_count_widget'));
    new FollowCountWidget($('#tiktok_follow_count_widget'));
    new GiftList($('#gift_list'));
    new CommentPieChart($('#comment_pie_chart'));
    new RoomInfo($('#room_info'));
    new SettingModal($('#setting-modal'));
  })
})