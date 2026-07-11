import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ShieldAlert, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Admin() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Form states for the currently editing additive
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    english_name: '',
    rating: 3,
    description: ''
  });

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/');
      return;
    }
    const { data } = await supabase.from('profiles').select('is_admin').eq('id', session.user.id).single();
    if (!data || !data.is_admin) {
      navigate('/');
      return;
    }
    fetchPending();
  };

  const fetchPending = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pending_additives')
      .select('*')
      .eq('status', 'pending')
      .order('scanned_at', { ascending: false });
    
    if (!error && data) setPending(data);
    setLoading(false);
  };

  const handleApprove = async (e) => {
    e.preventDefault();
    if (!formData.id || !formData.name) return alert("ID and Name are required!");

    try {
      // 1. Insert into additives
      const { error: insertError } = await supabase.from('additives').insert([{
        id: formData.id,
        name: formData.name,
        english_name: formData.english_name || null,
        rating: parseInt(formData.rating),
        description: formData.description || null
      }]);

      if (insertError) throw insertError;

      // 2. Update status in pending_additives
      await supabase.from('pending_additives').update({ status: 'approved' }).eq('id', editId);
      
      setEditId(null);
      fetchPending();
    } catch (err) {
      alert("Error approving additive: " + err.message);
    }
  };

  const handleReject = async (id) => {
    await supabase.from('pending_additives').update({ status: 'rejected' }).eq('id', id);
    fetchPending();
  };

  const startEdit = (item) => {
    setEditId(item.id);
    setFormData({
      id: item.scanned_name.toUpperCase().replace(/\s/g, ''),
      name: item.scanned_name,
      english_name: '',
      rating: 3,
      description: ''
    });
  };

  if (loading) return <div className="glass-panel" style={{textAlign:'center'}}>Loading Admin Dashboard...</div>;

  return (
    <div className="admin-container">
      <header className="header" style={{ marginBottom: '2rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <ShieldAlert color="var(--rating-5)" /> Admin Dashboard
        </h2>
        <p>Review and approve unknown ingredients scanned by users.</p>
      </header>

      {pending.length === 0 ? (
        <div className="glass-panel" style={{textAlign:'center'}}>
          <p>No pending additives! The database is fully up to date.</p>
        </div>
      ) : (
        <div className="results-container">
          {pending.map((item) => (
            <div key={item.id} className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>Scanned: <strong>{item.scanned_name}</strong></h3>
                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                  {new Date(item.scanned_at).toLocaleDateString()}
                </span>
              </div>

              {editId === item.id ? (
                <form onSubmit={handleApprove} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <input className="textarea-input" style={{ minHeight:'auto', padding:'0.8rem' }} placeholder="E-number or ID (e.g. E100)" value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} required />
                    <input className="textarea-input" style={{ minHeight:'auto', padding:'0.8rem' }} placeholder="Risk Rating (1-5)" type="number" min="1" max="5" value={formData.rating} onChange={e => setFormData({...formData, rating: e.target.value})} required />
                  </div>
                  <input className="textarea-input" style={{ minHeight:'auto', padding:'0.8rem' }} placeholder="Official Name (Czech)" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                  <input className="textarea-input" style={{ minHeight:'auto', padding:'0.8rem' }} placeholder="English Name (Optional)" value={formData.english_name} onChange={e => setFormData({...formData, english_name: e.target.value})} />
                  <textarea className="textarea-input" placeholder="Description of the additive and its effects..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                  
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditId(null)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" style={{ background: 'var(--rating-2)' }}>Approve & Save</button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button className="btn btn-primary" onClick={() => startEdit(item)}>
                    <Check size={18} /> Review & Add
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleReject(item.id)}>
                    <X size={18} /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
