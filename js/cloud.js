/* Cloud layer (Supabase). Optional: when CLOUD_CONFIG is empty the app runs local-only.
   Exposes window.Cloud with: enabled, ready, user, profile, signIn, signUp, signOut, resetPassword,
   push, pullMine, listAll, load, remove, listUsers, setRole. All methods return Promises. */
(function () {
  'use strict';
  const cfg = window.CLOUD_CONFIG || {};
  const enabled = !!(cfg.url && cfg.anonKey && window.supabase && window.supabase.createClient);
  const Cloud = { enabled, ready: false, user: null, profile: null, client: null, onAuthChange: null };
  window.Cloud = Cloud;
  if (!enabled) return;

  const sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  Cloud.client = sb;

  async function loadProfile() {
    if (!Cloud.user) { Cloud.profile = null; return null; }
    const { data, error } = await sb.from('profiles').select('id,email,full_name,role').eq('id', Cloud.user.id).maybeSingle();
    if (error) { console.warn('profile load failed', error); Cloud.profile = null; return null; }
    Cloud.profile = data; return data;
  }
  Cloud.init = async function () {
    const { data } = await sb.auth.getSession();
    Cloud.user = data.session ? data.session.user : null;
    await loadProfile();
    Cloud.ready = true;
    sb.auth.onAuthStateChange(async (_evt, session) => {
      const before = Cloud.user ? Cloud.user.id : null;
      Cloud.user = session ? session.user : null;
      if ((Cloud.user ? Cloud.user.id : null) !== before) { await loadProfile(); if (Cloud.onAuthChange) Cloud.onAuthChange(); }
    });
    return Cloud.user;
  };
  Cloud.refreshProfile = loadProfile;
  Cloud.isAdmin = () => !!(Cloud.profile && Cloud.profile.role === 'admin');
  Cloud.isActive = () => !!(Cloud.profile && (Cloud.profile.role === 'admin' || Cloud.profile.role === 'inspector'));

  Cloud.signIn = async (email, password) => { const { data, error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; Cloud.user = data.user; await loadProfile(); return data.user; };
  Cloud.signUp = async (email, password, fullName) => { const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fullName } } }); if (error) throw error; Cloud.user = data.user; if (data.session) await loadProfile(); return data; };
  Cloud.signOut = async () => { await sb.auth.signOut(); Cloud.user = null; Cloud.profile = null; };
  Cloud.resetPassword = async (email) => { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error; };
  Cloud.updatePassword = async (password) => { const { error } = await sb.auth.updateUser({ password }); if (error) throw error; };

  // summary: { facility_name, facility_kind, region, target_star, result_star, compliant_958, complete, points, threshold, assessed_on }
  Cloud.push = async (assessment, summary) => {
    if (!Cloud.user || !Cloud.isActive()) return null;
    const row = Object.assign({ id: assessment.id, owner_id: assessment.owner_id || Cloud.user.id, owner_name: assessment.owner_name || (Cloud.profile && (Cloud.profile.full_name || Cloud.profile.email)) || '', data: assessment, updated_at: assessment.updatedAt || new Date().toISOString() }, summary);
    if (!Cloud.isAdmin()) row.owner_id = Cloud.user.id;
    const { error } = await sb.from('assessments').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    return true;
  };
  Cloud.pullMine = async () => {
    if (!Cloud.user) return [];
    const { data, error } = await sb.from('assessments').select('id,owner_id,owner_name,updated_at,data').eq('owner_id', Cloud.user.id);
    if (error) throw error;
    return (data || []).map(r => Object.assign({}, r.data, { id: r.id, owner_id: r.owner_id, owner_name: r.owner_name, updatedAt: r.data.updatedAt || r.updated_at }));
  };
  Cloud.listAll = async () => {
    const { data, error } = await sb.from('assessments_summary').select('*').order('updated_at', { ascending: false }).limit(2000);
    if (error) throw error;
    return data || [];
  };
  Cloud.load = async (id) => {
    const { data, error } = await sb.from('assessments').select('id,owner_id,owner_name,updated_at,data').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return Object.assign({}, data.data, { id: data.id, owner_id: data.owner_id, owner_name: data.owner_name });
  };
  Cloud.remove = async (id) => { const { error } = await sb.from('assessments').delete().eq('id', id); if (error) throw error; };
  Cloud.listUsers = async () => { const { data, error } = await sb.from('profiles').select('id,email,full_name,role,created_at').order('created_at'); if (error) throw error; return data || []; };
  Cloud.setRole = async (id, role) => { const { error } = await sb.from('profiles').update({ role }).eq('id', id); if (error) throw error; };
})();
