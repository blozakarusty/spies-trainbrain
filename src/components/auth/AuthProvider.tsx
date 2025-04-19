
import { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";

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
          // Don't redirect if already on the home page
          if (location.pathname !== '/') {
            navigate('/');
          }
        }
        if (event === 'SIGNED_OUT') {
          // Don't redirect if already on the auth page
          if (location.pathname !== '/auth') {
            navigate('/auth');
          }
        }
      }
    );

    // Handle hash fragments for auth in URL
    const handleAuthInUrl = async () => {
      const hasAuthParams = window.location.hash && 
        (window.location.hash.includes('access_token=') || 
         window.location.hash.includes('refresh_token=') ||
         window.location.hash.includes('type=recovery'));
         
      if (hasAuthParams) {
        // Let the auth system process the tokens from the URL
        // This will trigger onAuthStateChange event above
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          console.error("Error processing auth URL parameters:", error);
        } else if (data.user) {
          console.log("User authenticated from URL params:", data.user.email);
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
