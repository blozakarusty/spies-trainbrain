
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface LoginSignupFormProps {
  onForgotPassword: (email: string) => void;
}

export const LoginSignupForm = ({ onForgotPassword }: LoginSignupFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
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
          description: "We've sent you a confirmation link.",
        });
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
                onForgotPassword(email);
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
