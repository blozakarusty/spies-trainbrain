
import { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

interface AuthContextType {
  user: User | null;
  session: Session | null;
}

const AuthContext = createContext<AuthContextType>({ user: null, session: null });

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        console.log("Auth state changed:", event);
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          toast({
            title: "Signed in successfully",
            description: `Welcome${currentSession?.user?.email ? ` ${currentSession.user.email}` : ''}!`,
          });
          
          // Don't redirect if already on the home page
          if (location.pathname !== '/') {
            navigate('/');
          }
        }
        if (event === 'SIGNED_OUT') {
          toast({
            title: "Signed out",
            description: "You have been signed out successfully."
          });
          
          // Don't redirect if already on the auth page
          if (location.pathname !== '/auth') {
            navigate('/auth');
          }
        }
        if (event === 'PASSWORD_RECOVERY') {
          toast({
            title: "Password Reset",
            description: "Please enter a new password."
          });
          navigate('/auth');
        }
        if (event === 'USER_UPDATED') {
          toast({
            title: "Profile Updated",
            description: "Your profile has been updated successfully."
          });
        }
      }
    );

    // Handle hash fragments for auth in URL
    const handleAuthInUrl = async () => {
      // Check for hash fragments that indicate auth actions
      const hasAuthParams = window.location.hash && 
        (window.location.hash.includes('access_token=') || 
         window.location.hash.includes('refresh_token=') ||
         window.location.hash.includes('type=recovery'));
         
      if (hasAuthParams) {
        try {
          // Extract tokens from hash
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          const type = hashParams.get('type');
          
          console.log("Auth URL parameters detected:", { type });
          
          // Handle recovery flow specifically
          if (type === 'recovery' && accessToken) {
            // Let Supabase handle the token exchange
            const { data, error } = await supabase.auth.getUser();
            
            if (error) {
              console.error("Error processing auth URL parameters:", error);
              throw error;
            }
            
            if (data.user) {
              console.log("User authenticated from URL params:", data.user.email);
              
              // At this point, the user should be logged in and the onAuthStateChange will handle the navigation
            }
          }
        } catch (error) {
          console.error("Failed to process auth tokens:", error);
          toast({
            title: "Authentication Error",
            description: "There was a problem processing your authentication. Please try again.",
            variant: "destructive"
          });
        }
      }
    };

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      
      // Only redirect if not already on the correct page
      if (!currentSession && location.pathname !== '/auth') {
        navigate('/auth');
      } else if (currentSession && location.pathname === '/auth') {
        navigate('/');
      }
      
      handleAuthInUrl();
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate, location.pathname]);

  return (
    <AuthContext.Provider value={{ user, session }}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
};
