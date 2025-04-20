
import { useState } from 'react';
import { LoginSignupForm } from './LoginSignupForm';
import { PasswordResetForm } from './PasswordResetForm';

interface AuthFormProps {
  showResetPassword?: boolean;
  recoveryToken?: string | null;
}

export const AuthForm = ({ showResetPassword: initialShowResetPassword = false, recoveryToken = null }: AuthFormProps) => {
  const [showResetPassword, setShowResetPassword] = useState(initialShowResetPassword);
  const [email, setEmail] = useState('');

  const handleBackToSignIn = () => {
    setShowResetPassword(false);
  };

  const handleForgotPassword = () => {
    setShowResetPassword(true);
  };

  return showResetPassword ? (
    <PasswordResetForm
      email={email}
      recoveryToken={recoveryToken}
      onBackToSignIn={handleBackToSignIn}
    />
  ) : (
    <LoginSignupForm onForgotPassword={handleForgotPassword} />
  );
};
