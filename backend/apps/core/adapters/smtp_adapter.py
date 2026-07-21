from ..interfaces import IEmailService
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags

class SMTPAdapter(IEmailService):
    def send_welcome(self, user):
        subject = 'Bienvenido a Studyspace'
    
        html_message = render_to_string('emails/welcome.html', {
            'user': user,
        })

        plain_message = strip_tags(html_message)
    
        send_mail(
            subject,
            plain_message,
            'Studyspace App <noreply@studysapce.cetorres.dev>', 
            [user.email],
            html_message=html_message,
        )


    def send_reset_code(self, user, code_obj):
        subject = 'Código para restablecer tu contraseña'
    
        html_message = render_to_string('emails/reset_password.html', {
            'user': user,
            'code': code_obj.code
        })

        plain_message = strip_tags(html_message)
    
        send_mail(
            subject,
            plain_message,
            'Studyspace App <noreply@studysapce.cetorres.dev>', 
            [user.email],
            html_message=html_message,
            fail_silently=True
        )

    def send_verification_code(self, user, code_obj):
        subject = 'Bienvenido a Studyspace - Verifica tu cuenta'
    
        html_message = render_to_string('emails/verification.html', {
            'user': user,
            'code': code_obj.code
        })

        plain_message = strip_tags(html_message)
    
        send_mail(
            subject,
            plain_message,
            'Studyspace App <noreply@studysapce.cetorres.dev>', 
            [user.email],
            html_message=html_message,
        )

    def send_goodbye(self, user):
        subject = 'Lamentamos verte partir...'
    
        html_message = render_to_string('emails/goodbye.html', {
            'user': user,
        })

        plain_message = strip_tags(html_message)
    
        send_mail(
            subject,
            plain_message,
            'Studyspace App <noreply@studysapce.cetorres.dev>', 
            [user.email],
            html_message=html_message,
        )

    def send_reactivation_code(self, user, code_obj):
        subject = 'Código para reactivar tu cuenta'
    
        html_message = render_to_string('emails/reactivation.html', {
            'user': user,
            'code': code_obj.code
        })

        plain_message = strip_tags(html_message)
    
        send_mail(
            subject,
            plain_message,
            'Studyspace App <noreply@studysapce.cetorres.dev>', 
            [user.email],
            html_message=html_message,
        )

    def send(self, user, message, subject):
        html_message = render_to_string('emails/generic.html', {
            'user': user,
            'message': message
        })

        plain_message = strip_tags(html_message)
    
        send_mail(
            subject,
            plain_message,
            'Studyspace App <noreply@studysapce.cetorres.dev>', 
            [user.email],
            html_message=html_message,
        )
