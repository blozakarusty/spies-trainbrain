
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface AuthFormProps {
  showResetPassword?: boolean;
  recoveryToken?: string | null;
}

export const AuthForm = ({ showResetPassword: initialShowResetPassword = false, recoveryToken = null }: AuthFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showOTP, setShowOTP] = useState(false);
  const [otp, setOtp] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(initialShowResetPassword);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearError = () => setErrorMessage(null);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setIsLoading(true);
    
    try {
      if (isSignUp) {
        console.log("Attempting to sign up with email:", email);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
          }
        });
        
        if (error) throw error;
        
        console.log("Sign up response:", data);
        
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          throw new Error("This email is already registered. Please try logging in instead.");
        }
        
        toast({
          title: "Check your email",
          description: "We've sent you a confirmation link or enter the OTP code below.",
        });
        setShowOTP(true);
      } else {
        console.log("Attempting to sign in with email:", email);
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        
        toast({
          title: "Signed in successfully",
          description: "You are now logged in.",
        });
      }
    } catch (error: any) {
      console.error("Authentication error:", error);
      setErrorMessage(error.message);
      toast({
        title: "Authentication Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setIsLoading(true);
    
    try {
      if (!showResetPassword) {
        console.log("Sending password reset email to:", email);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth?type=recovery`,
        });
        
        if (error) throw error;
        
        toast({
          title: "Check your email",
          description: "We've sent you a password reset link.",
        });
      } else {
        if (newPassword !== confirmPassword) {
          throw new Error("Passwords don't match.");
        }
        
        if (newPassword.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        
        console.log("Attempting to update password with recovery token");
        
        const { error } = await supabase.auth.updateUser({
          password: newPassword
        });
        
        if (error) throw error;
        
        toast({
          title: "Success!",
          description: "Your password has been updated. Please sign in with your new password.",
        });
        
        // Reset form after successful password update
        setShowResetPassword(false);
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error: any) {
      console.error("Password reset error:", error);
      setErrorMessage(error.message);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOTP = async () => {
    clearError();
    setIsLoading(true);
    try {
      console.log("Verifying OTP for email:", email);
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'signup',
      });
      
      if (error) throw error;
      
      toast({
        title: "Success!",
        description: "Your account has been verified. You can now sign in.",
      });
      setShowOTP(false);
      setIsSignUp(false);
    } catch (error: any) {
      console.error("OTP verification error:", error);
      setErrorMessage(error.message);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPChange = (value: string) => {
    clearError();
    setOtp(value);
  };

  if (showOTP) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Verify your email</CardTitle>
          <CardDescription>
            Enter the verification code sent to your email
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-4">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={handleOTPChange}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button 
              onClick={verifyOTP} 
              className="w-full" 
              disabled={isLoading || otp.length < 6}
            >
              {isLoading ? "Verifying..." : "Verify Email"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Didn't receive the code?{' '}
              <button
                type="button"
                className="underline underline-offset-4 hover:text-primary"
                onClick={handleEmailAuth}
              >
                Resend code
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (showResetPassword) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Reset Your Password</CardTitle>
          <CardDescription>
            {recoveryToken ? "Enter a new password for your account" : "Enter your email to receive a reset link"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handlePasswordReset} className="space-y-4">
            {recoveryToken ? (
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="New Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <Input
                  type="password"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            ) : (
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Processing..." : recoveryToken ? "Update Password" : "Send Reset Link"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Remember your password?{' '}
            <button
              type="button"
              className="underline underline-offset-4 hover:text-primary"
              onClick={() => {
                clearError();
                setShowResetPassword(false);
              }}
            >
              Sign in
            </button>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>{isSignUp ? 'Create Account' : 'Welcome Back'}</CardTitle>
        <CardDescription>
          {isSignUp 
            ? 'Enter your details to create a new account' 
            : 'Enter your credentials to sign in'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {errorMessage && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => {
                clearError();
                setEmail(e.target.value);
              }}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                clearError();
                setPassword(e.target.value);
              }}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Processing..." : isSignUp ? 'Sign Up' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            className="underline underline-offset-4 hover:text-primary"
            onClick={() => {
              clearError();
              setIsSignUp(!isSignUp);
              setShowResetPassword(false);
            }}
          >
            {isSignUp ? 'Sign in' : 'Create one'}
          </button>
        </div>

        {!isSignUp && (
          <div className="mt-2 text-center text-sm text-muted-foreground">
            <button
              type="button"
              className="underline underline-offset-4 hover:text-primary"
              onClick={(e) => {
                e.preventDefault();
                clearError();
                setShowResetPassword(true);
              }}
            >
              Forgot password?
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
