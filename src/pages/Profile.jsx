import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { AlertTriangle, CheckCircle, Info, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const [session, setSession] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate('/auth');
      else {
        setSession(session);
        fetchHistory(session.user.id);
      }
    });
  }, [navigate]);

  const fetchHistory = async (userId) => {
    const { data, error } = await supabase
      .from('scan_history')
      .select('*')
      .eq('user_id', userId)
      .order('scanned_at', { ascending: false });
      
    if (!error && data) {
      setHistory(data);
    }
    setLoading(false);
  };

  const formatDate = (dateString) => {
    const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  if (loading) return <div className="glass-panel" style={{textAlign:'center'}}>Loading profile...</div>;

  return (
    <div className="profile-container">
      <header className="header" style={{ marginBottom: '2rem' }}>
        <h2>Your Scan History</h2>
        <p>Logged in as {session?.user?.email}</p>
      </header>

      {history.length === 0 ? (
        <div className="glass-panel" style={{textAlign:'center'}}>
          <p>You haven't scanned anything yet!</p>
        </div>
      ) : (
        <div className="results-container">
          {history.map((item) => (
            <div key={item.id} className={`ingredient-card rating-${item.rating}`}>
              <div className="card-header">
                <span className="card-title">
                  {item.rating >= 4 ? <AlertTriangle size={18} color="var(--rating-5)" /> : 
                   item.rating <= 2 ? <CheckCircle size={18} color="var(--rating-1)" /> : 
                   <Info size={18} color="var(--rating-3)" />}
                  {item.e_number} - {item.ingredient_name}
                </span>
                <span className={`badge badge-${item.rating}`}>
                  Risk Level: {item.rating}/5
                </span>
              </div>
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                <Clock size={14} />
                Scanned on {formatDate(item.scanned_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
