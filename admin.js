/* CLOSER Admin Dashboard. All data access uses the signed-in Supabase client and database RLS. */
let closerAdminRole = null;
let closerAdminUsersCache = [];
let closerAdminSettingsCache = [];

function closerAdminReady() {
  return !!currentUser && !!closerAdminRole;
}
function closerAdminDenied() {
  showToast('Admin access is required.');
  return false;
}
function closerAdminEsc(value) {
  return String(value === null || value === undefined ? '—' : value)
    .replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c];
    });
}
function closerAdminDate(value) {
  return value ? new Date(value).toLocaleString() : '—';
}
function closerAdminPill(value) {
  return '<span class="admin-pill">' + closerAdminEsc(value) + '</span>';
}
function closerAdminTable(headers, rows) {
  if (!rows.length) return '<div class="admin-empty">No records found.</div>';
  return '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
    headers.map(function (h) { return '<th>' + closerAdminEsc(h) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
}
async function closerAdminAudit(action, details) {
  try {
    const result = await sb.from('audit_logs').insert({
      actor_id: currentUser.id,
      action: action,
      details: typeof details === 'string' ? details : JSON.stringify(details || {})
    });
    if (result.error) console.warn('Admin audit insert failed:', result.error.message);
  } catch (error) {
    console.warn('Admin audit insert failed:', error);
  }
}
function showAdminTab(tab) {
  if (!closerAdminReady()) return closerAdminDenied();
  document.querySelectorAll('[data-admin-tab]').forEach(function (button) {
    button.classList.toggle('active', button.dataset.adminTab === tab);
  });
  document.querySelectorAll('.admin-panel').forEach(function (panel) {
    panel.classList.toggle('active', panel.id === 'adminPanel-' + tab);
  });
  const loaders = {
    overview: loadAdminOverview,
    users: loadAdminUsers,
    reports: loadAdminReports,
    content: loadAdminContent,
    verifications: loadAdminVerifications,
    roles: loadAdminRoles,
    settings: loadAdminSettings,
    audit: loadAdminAudit
  };
  if (loaders[tab]) loaders[tab]();
}
async function closerAdminCount(table, filterColumn, filterValue) {
  let query = sb.from(table).select('*', {count:'exact', head:true});
  if (filterColumn) query = query.eq(filterColumn, filterValue);
  const result = await query;
  if (result.error) throw result.error;
  return result.count || 0;
}
async function loadAdminOverview() {
  if (!closerAdminReady()) return;
  try {
    const values = await Promise.all([
      closerAdminCount('profiles'),
      closerAdminCount('posts'),
      closerAdminCount('reports', 'status', 'Pending'),
      closerAdminCount('verifications', 'status', 'Pending')
    ]);
    document.getElementById('adminUsersCount').textContent = values[0];
    document.getElementById('adminPostsCount').textContent = values[1];
    document.getElementById('adminReportsCount').textContent = values[2];
    document.getElementById('adminVerificationsCount').textContent = values[3];
    const audit = await sb.from('audit_logs')
      .select('id,actor_id,action,details,created_at')
      .order('created_at', {ascending:false}).limit(8);
    if (audit.error) throw audit.error;
    document.getElementById('adminRecentAudit').innerHTML = (audit.data || []).length
      ? audit.data.map(function (item) {
          return '<div class="row"><div class="grow"><strong>' + closerAdminEsc(item.action) +
            '</strong><small>' + closerAdminEsc(item.details) + '</small></div><small>' +
            closerAdminEsc(closerAdminDate(item.created_at)) + '</small></div>';
        }).join('')
      : '<div class="admin-empty">No admin activity recorded yet.</div>';
  } catch (error) {
    document.getElementById('adminRecentAudit').textContent = 'Could not load overview: ' + error.message;
  }
}
async function loadAdminUsers() {
  if (!closerAdminReady()) return;
  document.getElementById('adminUsersTable').textContent = 'Loading users…';
  const result = await sb.from('profiles')
    .select('id,email,full_name,username,status,verified,created_at,restriction_reason')
    .order('created_at', {ascending:false}).limit(200);
  if (result.error) {
    document.getElementById('adminUsersTable').textContent = 'Could not load users: ' + result.error.message;
    return;
  }
  closerAdminUsersCache = result.data || [];
  filterAdminUsers();
}
function filterAdminUsers() {
  const input = document.getElementById('adminUserSearch');
  const term = String(input ? input.value : '').trim().toLowerCase();
  const rows = closerAdminUsersCache.filter(function (user) {
    return !term || [user.full_name,user.username,user.email,user.id].some(function (value) {
      return String(value || '').toLowerCase().includes(term);
    });
  }).map(function (user) {
    const actions = '<div class="admin-actions">' +
      '<button onclick="setAdminUserStatus(\'' + user.id + '\',\'Active\')">Activate</button>' +
      '<button onclick="setAdminUserStatus(\'' + user.id + '\',\'Suspended\')">Suspend</button>' +
      '<button class="danger" onclick="setAdminUserStatus(\'' + user.id + '\',\'Banned\')">Ban</button>' +
      '<button onclick="setAdminVerified(\'' + user.id + '\',' + (!user.verified) + ')">' +
      (user.verified ? 'Unverify' : 'Verify') + '</button></div>';
    return '<tr><td>' + closerAdminEsc(user.full_name) + '<br><small>@' +
      closerAdminEsc(user.username) + '</small></td><td>' + closerAdminEsc(user.email) +
      '</td><td>' + closerAdminPill(user.status) + '</td><td>' +
      closerAdminPill(user.verified ? 'Verified' : 'Not verified') + '</td><td>' +
      closerAdminEsc(closerAdminDate(user.created_at)) + '</td><td>' + actions + '</td></tr>';
  });
  document.getElementById('adminUsersTable').innerHTML = closerAdminTable(
    ['User','Email','Status','Verification','Joined','Actions'], rows
  );
}
async function setAdminUserStatus(userId, status) {
  if (!closerAdminReady()) return closerAdminDenied();
  if (userId === currentUser.id && status !== 'Active') {
    showToast('You cannot suspend or ban your own active admin account.');
    return;
  }
  if (!confirm('Change this account status to ' + status + '?')) return;
  const reason = status === 'Active' ? null : (prompt('Optional restriction reason:') || null);
  const result = await sb.from('profiles').update({
    status:status, restriction_reason:reason, updated_at:new Date().toISOString()
  }).eq('id', userId);
  if (result.error) { showToast('Could not update account: ' + result.error.message); return; }
  await closerAdminAudit('user_status_changed', {user_id:userId,status:status,reason:reason});
  showToast('Account status updated.');
  await loadAdminUsers();
}
async function setAdminVerified(userId, verified) {
  if (!closerAdminReady()) return closerAdminDenied();
  const result = await sb.from('profiles').update({
    verified:verified, updated_at:new Date().toISOString()
  }).eq('id', userId);
  if (result.error) { showToast('Could not update verification: ' + result.error.message); return; }
  await closerAdminAudit('profile_verification_changed', {user_id:userId,verified:verified});
  showToast('Verification status updated.');
  await loadAdminUsers();
}
async function loadAdminReports() {
  if (!closerAdminReady()) return;
  document.getElementById('adminReportsTable').textContent = 'Loading reports…';
  const result = await sb.from('reports')
    .select('id,reporter_id,target_user_id,reason,priority,status,details,created_at')
    .order('created_at', {ascending:false}).limit(200);
  if (result.error) {
    document.getElementById('adminReportsTable').textContent = 'Could not load reports: ' + result.error.message;
    return;
  }
  const rows = (result.data || []).map(function (report) {
    const actions = '<div class="admin-actions">' +
      '<button onclick="setAdminReportStatus(\'' + report.id + '\',\'Under review\')">Review</button>' +
      '<button onclick="setAdminReportStatus(\'' + report.id + '\',\'Resolved\')">Resolve</button>' +
      '<button onclick="setAdminReportStatus(\'' + report.id + '\',\'Dismissed\')">Dismiss</button></div>';
    return '<tr><td>' + closerAdminEsc(report.reason) + '<br><small>' +
      closerAdminEsc(report.details) + '</small></td><td>' + closerAdminEsc(report.reporter_id) +
      '</td><td>' + closerAdminEsc(report.target_user_id) + '</td><td>' +
      closerAdminPill(report.priority) + '</td><td>' + closerAdminPill(report.status) +
      '</td><td>' + closerAdminEsc(closerAdminDate(report.created_at)) + '</td><td>' +
      actions + '</td></tr>';
  });
  document.getElementById('adminReportsTable').innerHTML = closerAdminTable(
    ['Report','Reporter ID','Target user ID','Priority','Status','Created','Actions'], rows
  );
}
async function setAdminReportStatus(id, status) {
  if (!closerAdminReady()) return closerAdminDenied();
  const result = await sb.from('reports').update({
    status:status,
    resolved_at:(status === 'Resolved' || status === 'Dismissed') ? new Date().toISOString() : null
  }).eq('id', id);
  if (result.error) { showToast('Could not update report: ' + result.error.message); return; }
  await closerAdminAudit('user_report_status_changed', {report_id:id,status:status});
  showToast('Report updated.');
  await loadAdminReports();
}
async function loadAdminContent() {
  if (!closerAdminReady()) return;
  const results = await Promise.all([
    sb.from('content_reports').select('id,content_type,content_id,owner_id,title,reports_count,priority,status,reason,details,created_at').order('created_at',{ascending:false}).limit(100),
    sb.from('posts').select('id,author_id,body,audience,created_at').order('created_at',{ascending:false}).limit(40),
    sb.from('stories').select('id,author_id,caption,media_type,created_at,expires_at').order('created_at',{ascending:false}).limit(40)
  ]);
  const reportRows = results[0].error ? [] : (results[0].data || []).map(function (item) {
    const actions = '<div class="admin-actions"><button onclick="setAdminContentReportStatus(\'' + item.id + '\',\'Dismissed\')">Dismiss</button>' +
      '<button class="danger" onclick="setAdminContentReportStatus(\'' + item.id + '\',\'Removed\')">Mark removed</button></div>';
    return '<tr><td>' + closerAdminEsc(item.title || item.content_type) + '<br><small>' +
      closerAdminEsc(item.content_id) + '</small></td><td>' + closerAdminEsc(item.owner_id) +
      '</td><td>' + closerAdminEsc(item.reports_count) + '</td><td>' +
      closerAdminPill(item.priority) + '</td><td>' + closerAdminPill(item.status) +
      '</td><td>' + closerAdminEsc(item.reason) + '<br><small>' +
      closerAdminEsc(item.details) + '</small></td><td>' + actions + '</td></tr>';
  });
  document.getElementById('adminContentReports').innerHTML = results[0].error
    ? 'Could not load content reports: ' + closerAdminEsc(results[0].error.message)
    : closerAdminTable(['Content','Owner ID','Reports','Priority','Status','Reason','Actions'], reportRows);

  const postRows = results[1].error ? [] : (results[1].data || []).map(function (item) {
    return '<tr><td>' + closerAdminEsc(item.body || '[Media post]') + '</td><td>' +
      closerAdminEsc(item.author_id) + '</td><td>' + closerAdminEsc(item.audience) +
      '</td><td>' + closerAdminEsc(closerAdminDate(item.created_at)) + '</td><td>' +
      '<button class="danger" onclick="deleteAdminContent(\'posts\',\'' + item.id + '\')">Remove post</button></td></tr>';
  });
  document.getElementById('adminPostsTable').innerHTML = results[1].error
    ? 'Could not load posts: ' + closerAdminEsc(results[1].error.message)
    : closerAdminTable(['Post','Author ID','Audience','Created','Action'], postRows);

  const storyRows = results[2].error ? [] : (results[2].data || []).map(function (item) {
    return '<tr><td>' + closerAdminEsc(item.caption || '[Media story]') + '</td><td>' +
      closerAdminEsc(item.author_id) + '</td><td>' + closerAdminEsc(item.media_type) +
      '</td><td>' + closerAdminEsc(closerAdminDate(item.created_at)) + '</td><td>' +
      '<button class="danger" onclick="deleteAdminContent(\'stories\',\'' + item.id + '\')">Remove story</button></td></tr>';
  });
  document.getElementById('adminStoriesTable').innerHTML = results[2].error
    ? 'Could not load stories: ' + closerAdminEsc(results[2].error.message)
    : closerAdminTable(['Story','Author ID','Type','Created','Action'], storyRows);
}
async function setAdminContentReportStatus(id, status) {
  if (!closerAdminReady()) return closerAdminDenied();
  const result = await sb.from('content_reports').update({status:status}).eq('id', id);
  if (result.error) { showToast('Could not update content report: ' + result.error.message); return; }
  await closerAdminAudit('content_report_status_changed', {report_id:id,status:status});
  showToast('Content report updated.');
  await loadAdminContent();
}
async function deleteAdminContent(table, id) {
  if (!closerAdminReady()) return closerAdminDenied();
  if (table !== 'posts' && table !== 'stories') return;
  if (!confirm('Permanently remove this ' + (table === 'posts' ? 'post' : 'story') + '?')) return;
  const result = await sb.from(table).delete().eq('id', id);
  if (result.error) { showToast('Could not remove content: ' + result.error.message); return; }
  await closerAdminAudit('content_removed', {table:table,content_id:id});
  showToast('Content removed.');
  await loadAdminContent();
}
async function loadAdminVerifications() {
  if (!closerAdminReady()) return;
  document.getElementById('adminVerificationsTable').textContent = 'Loading verification requests…';
  const result = await sb.from('verifications')
    .select('id,user_id,verification_type,status,notes,created_at,reviewed_at')
    .order('created_at', {ascending:false}).limit(200);
  if (result.error) {
    document.getElementById('adminVerificationsTable').textContent = 'Could not load verifications: ' + result.error.message;
    return;
  }
  const rows = (result.data || []).map(function (item) {
    const actions = '<div class="admin-actions"><button onclick="setAdminVerification(\'' + item.id + '\',\'Approved\')">Approve</button>' +
      '<button onclick="setAdminVerification(\'' + item.id + '\',\'Rejected\')">Reject</button></div>';
    return '<tr><td>' + closerAdminEsc(item.user_id) + '</td><td>' +
      closerAdminEsc(item.verification_type) + '</td><td>' + closerAdminPill(item.status) +
      '</td><td>' + closerAdminEsc(item.notes) + '</td><td>' +
      closerAdminEsc(closerAdminDate(item.created_at)) + '</td><td>' + actions + '</td></tr>';
  });
  document.getElementById('adminVerificationsTable').innerHTML = closerAdminTable(
    ['User ID','Type','Status','Notes','Created','Actions'], rows
  );
}
async function setAdminVerification(id, status) {
  if (!closerAdminReady()) return closerAdminDenied();
  const notes = prompt('Optional review note:') || null;
  const result = await sb.from('verifications').update({
    status:status, notes:notes, reviewed_at:new Date().toISOString()
  }).eq('id', id);
  if (result.error) { showToast('Could not update request: ' + result.error.message); return; }
  await closerAdminAudit('verification_reviewed', {verification_id:id,status:status,notes:notes});
  showToast('Verification updated.');
  await loadAdminVerifications();
}
async function loadAdminRoles() {
  if (!closerAdminReady()) return closerAdminDenied();
  const manager = document.getElementById('adminRoleManager');
  const form = document.getElementById('adminRoleForm');
  const canManage = closerAdminRole === 'Super Admin';
  manager.textContent = canManage
    ? 'You are a Super Admin. Grant roles only to trusted, already-registered CLOSER users.'
    : 'Your role is ' + closerAdminRole + '. Only a Super Admin can change roles.';
  form.classList.toggle('hidden', !canManage);
  const result = await sb.from('admin_roles').select('user_id,role,created_at').order('created_at',{ascending:false});
  if (result.error) { document.getElementById('adminRolesTable').textContent = 'Could not load roles: ' + result.error.message; return; }
  const ids = (result.data || []).map(function (item) { return item.user_id; });
  let profileRows = [];
  if (ids.length) {
    const profiles = await sb.from('profiles').select('id,email,full_name,username').in('id', ids);
    profileRows = profiles.data || [];
  }
  const profileMap = new Map(profileRows.map(function (profile) { return [profile.id,profile]; }));
  const rows = (result.data || []).map(function (item) {
    const profile = profileMap.get(item.user_id) || {};
    const remove = canManage && item.user_id !== currentUser.id
      ? '<button class="danger" onclick="removeAdminRole(\'' + item.user_id + '\')">Revoke</button>'
      : '—';
    return '<tr><td>' + closerAdminEsc(profile.full_name || profile.username) + '<br><small>' +
      closerAdminEsc(profile.email || item.user_id) + '</small></td><td>' +
      closerAdminPill(item.role) + '</td><td>' +
      closerAdminEsc(closerAdminDate(item.created_at)) + '</td><td>' + remove + '</td></tr>';
  });
  document.getElementById('adminRolesTable').innerHTML = closerAdminTable(
    ['Admin user','Role','Granted','Actions'], rows
  );
}
async function grantAdminRole() {
  if (closerAdminRole !== 'Super Admin') return closerAdminDenied();
  const email = document.getElementById('adminRoleEmail').value.trim().toLowerCase();
  const role = document.getElementById('adminRoleSelect').value;
  if (!email || ['Super Admin','Moderator','Support','Finance'].indexOf(role) < 0) {
    showToast('Enter a registered user email and choose a role.');
    return;
  }
  const profile = await sb.from('profiles').select('id,email').eq('email', email).maybeSingle();
  if (profile.error || !profile.data) {
    showToast('No CLOSER profile found. That person must register first.');
    return;
  }
  if (profile.data.id === currentUser.id && role !== 'Super Admin') {
    showToast('You cannot downgrade your own Super Admin role here.');
    return;
  }
  const result = await sb.from('admin_roles').upsert(
    {user_id:profile.data.id,role:role}, {onConflict:'user_id'}
  );
  if (result.error) { showToast('Could not grant role: ' + result.error.message); return; }
  await closerAdminAudit('admin_role_granted', {user_id:profile.data.id,role:role});
  document.getElementById('adminRoleEmail').value = '';
  showToast('Admin role saved.');
  await loadAdminRoles();
}
async function removeAdminRole(userId) {
  if (closerAdminRole !== 'Super Admin') return closerAdminDenied();
  if (userId === currentUser.id) { showToast('You cannot revoke your own Super Admin role here.'); return; }
  if (!confirm('Revoke this user’s administrative access?')) return;
  const result = await sb.from('admin_roles').delete().eq('user_id', userId);
  if (result.error) { showToast('Could not revoke role: ' + result.error.message); return; }
  await closerAdminAudit('admin_role_revoked', {user_id:userId});
  showToast('Admin role revoked.');
  await loadAdminRoles();
}
async function loadAdminSettings() {
  if (!closerAdminReady()) return;
  document.getElementById('adminSettingsTable').textContent = 'Loading settings…';
  const result = await sb.from('admin_settings').select('key,value,updated_at,updated_by').order('key');
  if (result.error) {
    document.getElementById('adminSettingsTable').textContent = 'Could not load settings: ' + result.error.message;
    return;
  }
  closerAdminSettingsCache = result.data || [];
  const rows = closerAdminSettingsCache.map(function (item, index) {
    return '<tr><td>' + closerAdminEsc(item.key) + '</td><td><code>' +
      closerAdminEsc(JSON.stringify(item.value)) + '</code></td><td>' +
      closerAdminEsc(closerAdminDate(item.updated_at)) + '</td><td>' +
      '<button onclick="fillAdminSetting(' + index + ')">Edit</button></td></tr>';
  });
  document.getElementById('adminSettingsTable').innerHTML = closerAdminTable(['Key','JSON value','Updated','Action'], rows);
}
function fillAdminSetting(index) {
  const item = closerAdminSettingsCache[index];
  if (!item) return;
  document.getElementById('adminSettingKey').value = item.key;
  document.getElementById('adminSettingValue').value = JSON.stringify(item.value);
}
async function saveAdminSetting() {
  if (!closerAdminReady()) return closerAdminDenied();
  const key = document.getElementById('adminSettingKey').value.trim();
  const raw = document.getElementById('adminSettingValue').value.trim();
  if (!key || !raw) { showToast('Enter a setting key and JSON value.'); return; }
  let value;
  try { value = JSON.parse(raw); } catch (error) { showToast('The setting value must be valid JSON.'); return; }
  const result = await sb.from('admin_settings').upsert({
    key:key, value:value, updated_at:new Date().toISOString(), updated_by:currentUser.id
  }, {onConflict:'key'});
  if (result.error) { showToast('Could not save setting: ' + result.error.message); return; }
  await closerAdminAudit('admin_setting_updated', {key:key});
  document.getElementById('adminSettingKey').value = '';
  document.getElementById('adminSettingValue').value = '';
  showToast('Setting saved.');
  await loadAdminSettings();
}
async function loadAdminAudit() {
  if (!closerAdminReady()) return;
  document.getElementById('adminAuditTable').textContent = 'Loading audit log…';
  const result = await sb.from('audit_logs').select('id,actor_id,action,details,created_at')
    .order('created_at',{ascending:false}).limit(200);
  if (result.error) {
    document.getElementById('adminAuditTable').textContent = 'Could not load audit log: ' + result.error.message;
    return;
  }
  const rows = (result.data || []).map(function (item) {
    return '<tr><td>' + closerAdminEsc(closerAdminDate(item.created_at)) +
      '</td><td>' + closerAdminEsc(item.actor_id) + '</td><td>' +
      closerAdminEsc(item.action) + '</td><td>' +
      closerAdminEsc(item.details) + '</td></tr>';
  });
  document.getElementById('adminAuditTable').innerHTML = closerAdminTable(
    ['Time','Admin user ID','Action','Details'], rows
  );
}
