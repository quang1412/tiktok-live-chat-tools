(function () {
	'use strict'
  
	// Fetch all the forms we want to apply custom Bootstrap validation styles to
	let forms = document.querySelectorAll('.needs-validation')
  let email = $('input[name="email"]')
  let submit_btn = $('form button[type="submit"]')
  let password = $('input[name="password"]')
	// Loop over them and prevent submission
	Array.prototype.slice.call(forms)
  .forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!form.checkValidity()) {
        event.preventDefault()
        event.stopPropagation()
      } else {
        submit_btn.addClass('disabled')
        submit_btn.children('.spinner').show()
        $.post(location.href , $('form').serializeArray())
        .done(res => {
          if(res.mess){
            alert(res.mess)
          }
          if(res.redirect){
            window.location.href = res.redirect 
          }
          submit_btn.removeClass('disabled')
          submit_btn.children('.spinner').hide()
        })
        .fail(res => {
          alert('Lỗi máy chủ\n'+res)
        })
      }
      form.classList.add('was-validated')
    }, false)
  })
  
  $('input[name="password_confirm"]').change(function(){
    let valid = $(this).val() == password.val()
    $(this)[0].setCustomValidity(valid ? '':'invalid')
  })
  
  $('input').on('change', function(e){
    $(this).removeClass('is-invalid').addClass('is-valid')
    this.setCustomValidity('')
    if(!this.checkValidity()) {
      $(this).addClass('is-invalid').removeClass('is-valid')
      this.setCustomValidity('invalid')
    }
  })
  
  $('#send-validcode').click(function(){
    if(!email[0].checkValidity()){
      email.addClass('is-invalid')
      return
    }
    $(this).addClass('disabled')
    $(this).children('.spinner').show()
    $.post('/validate-email',{email:email.val()})
    .done(res => {
      if(res.error){
        email.addClass('is-invalid')
        email[0].setCustomValidity('invalid')
        $(this).removeClass('disabled')
        $(this).children('.spinner').hide()
        alert('Lỗi\n'+res.mess)
        return
      }
      alert(res.mess)
      $(this).children('.spinner').hide()
      for(let i = 60; i >= 0; i--){
        setTimeout(()=>{
          $(this).text(Math.abs(i-60))
          if(i == 60){
            $(this).removeClass('disabled').text('Lấy mã')
          }
        },i*1000)
      }
    })
    .fail(err => {
      alert('Lỗi server')
    })
  })
})()