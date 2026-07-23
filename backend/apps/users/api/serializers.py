from django.contrib.auth.password_validation import validate_password
from django.contrib.auth import authenticate
from rest_framework.exceptions import AuthenticationFailed  
from rest_framework import serializers
from apps.users.models import User, UserImage


class EmailLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(username=data['email'], password=data['password'])

        if not user:
            raise AuthenticationFailed("Credenciales invalidas")

        if not user.is_active:
            raise AuthenticationFailed("Cuenta inactiva")

        self.context['user'] = user
        return data


class EmailRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    email = serializers.EmailField(required=True)

    phone = serializers.CharField(min_length=8, max_length=8, required=False)

    class Meta:
        model = User
        fields = ['email', 'password', 'first_name', 'last_name', 'phone'] 

    def validate_email(self, value):
        user = User.objects.filter(email=value).first()
        
        if user:
            if user.is_active:
                raise serializers.ValidationError("Este correo ya está registrado.")
            else:
                return value
        
        return value


class UserImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserImage
        fields = ['id', 'url']


class UserOutputSerializer(serializers.ModelSerializer):
    profile_img = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name','avatar_url', 'profile_img', 'is_verified', 'is_active', 'phone']

    def get_profile_img(self, user):
        image = user.user_images.last() 
        if image:
            return UserImageSerializer(image).data
        return None


class AuthResponseSerializer(serializers.Serializer):
    """
    Estandariza la respuesta de login para que el Frontend siempre reciba lo mismo.
    """
    tokens = serializers.DictField(help_text="{access, refresh}")
    user = UserOutputSerializer()


class UserUpdateSerializer(serializers.ModelSerializer):
    new_profile_img = serializers.ImageField(required=False)
    profile_img_to_delete_id = serializers.IntegerField(required=False)
    phone = serializers.CharField(min_length=8, max_length=8, required=False)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'phone', 'avatar_url', 'new_profile_img', 'profile_img_to_delete_id']


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ActivationSerializer(serializers.Serializer):
    code = serializers.CharField(min_length=6, max_length=6)
    email = serializers.EmailField()

class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, validators=[validate_password])

    def validate_old_password(self, value):
        user = self.context['request'].user
        
        if not user.check_password(value):
            raise serializers.ValidationError("La contraseña actual es incorrecta.")
        return value

    def validate(self, data):
        if data['old_password'] == data['new_password']:
            raise serializers.ValidationError("La nueva contraseña debe ser diferente a la actual.")
        return data


class PasswordResetConfirmSerializer(serializers.Serializer):
    code = serializers.CharField(min_length=6, max_length=6)
    email = serializers.EmailField()
    new_password = serializers.CharField(required=True, validators=[validate_password])
