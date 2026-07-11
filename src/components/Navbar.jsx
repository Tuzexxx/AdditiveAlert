import { Link, useNavigate } from 'react-router-dom';
import { Home, User, Shield, LogOut } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useState, useEffect } from 'react';

export default function Navbar() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      checkAdmin(session?.user?.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      checkAdmin(session?.user?.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdmin = async (userId) => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    const { data } = await supabase.from('profiles').select('is_admin').eq('id', userId).single();
    setIsAdmin(data?.is_admin || false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <Link to="/" className="nav-brand">AdditiveAlert</Link>
      <div className="nav-links">
        <Link to="/" className="nav-item"><Home size={20} /></Link>
        {isAdmin && <Link to="/admin" className="nav-item"><Shield size={20} color="var(--rating-5)"/></Link>}
        {session ? (
          <>
            <Link to="/profile" className="nav-item"><User size={20} /></Link>
            <button onClick={handleLogout} className="nav-item btn-icon"><LogOut size={20} /></button>
          </>
        ) : (
          <Link to="/auth" className="nav-item"><User size={20} /></Link>
        )}
      </div>
    </nav>
  );
}
