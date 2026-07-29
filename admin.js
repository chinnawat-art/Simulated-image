const SUPABASE_URL = 'https://jxvoejdqcjxndqwqgvoj.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4dm9lamRxY2p4bmRxd3Fndm9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NzY4MTEsImV4cCI6MjEwMDI1MjgxMX0.OHXJVqB_99UadWY6_6CMSMv67QTtulD7aYKaXjdtYho';
  const EDGE_FUNCTION_NAME = 'admin-api';
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/${EDGE_FUNCTION_NAME}`;

  const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const entityMap = {
    room_scenes: {table:'room_scenes', display:'ฉากห้อง', fields:['scene_key','name','image_path','width','height','floor_frac','sort_order','is_active']},
    door_products: {table:'door_products', display:'บานประตู', fields:['door_key','name','image_path','canvas_w','canvas_h','bottom_frac','sort_order','is_active']},
    handle_products: {table:'handle_products', display:'มือจับ', fields:['handle_key','name','image_path','sort_order','is_active']}
  };
  const fieldLabelMap = {
    scene_key: 'คีย์ฉาก',
    door_key: 'คีย์บานประตู',
    handle_key: 'คีย์มือจับ',
    name: 'ชื่อ',
    image_path: 'พาธรูปภาพ',
    width: 'กว้าง',
    height: 'สูง',
    canvas_w: 'กว้าง',
    canvas_h: 'สูง',
    floor_frac: 'ตำแหน่งพื้น',
    bottom_frac: 'ตำแหน่งขอบล่าง',
    sort_order: 'ลำดับ',
    is_active: 'เปิดใช้งาน'
  };

  const $ = id => document.getElementById(id);
  const status = $('status');
  const entityLabel = $('entityLabel');
  const entityTableName = $('entityTableName');
  const entityCount = $('entityCount');
  const lastActionLabel = $('lastActionLabel');
  const lastActionTime = $('lastActionTime');
  const imageModal = $('imageModal');
  const imageModalImg = $('imageModalImg');
  const imageModalTitle = $('imageModalTitle');
  let autoKeySyncEnabled = true;
  let autoKeyRequestId = 0;
  const STORAGE_BUCKET = 'door-scenes';
  let localPreviewObjectUrl = '';
  let currentAdminUser = null;
  let hasInitializedAdminData = false;

  function applyAuthGate(){
    const isSignedIn = !!currentAdminUser;
    document.body.classList.toggle('auth-locked', !isSignedIn);
    document.body.classList.toggle('auth-ready', isSignedIn);

    if(status && !isSignedIn){
      status.textContent = 'กรุณาเข้าสู่ระบบเพื่อใช้งานแผงผู้ดูแล';
      status.dataset.tone = 'info';
    }
  }

  async function initializeAdminAfterAuth(){
    if(!currentAdminUser) return;
    if(hasInitializedAdminData) return;
    hasInitializedAdminData = true;
    await clearForm();
    syncEntitySummary();
    await listEntities();
  }

  function mountAuthUi(){
    const heroSide = document.querySelector('.hero-side');
    if(!heroSide || heroSide.querySelector('#authStatus')) return;

    const authWrap = document.createElement('div');
    authWrap.className = 'auth-stack';
    authWrap.innerHTML = `
      <div class="auth-top">
        <div class="auth-copy">
          <div class="auth-eyebrow">Admin Access</div>
          <h3 class="auth-title">เข้าสู่ระบบผู้ดูแลระบบ</h3>
          <p class="auth-note">ใช้บัญชี Supabase Auth เพื่อจัดการข้อมูลสินค้า รูปภาพ และรายการในระบบอย่างปลอดภัย</p>
        </div>
        <div id="authStatus" class="auth-state" data-state="signed-out">ยังไม่ได้เข้าสู่ระบบ</div>
      </div>
      <div class="auth-row">
        <label class="auth-field">
          <span class="auth-label">อีเมลผู้ดูแล</span>
          <input id="authEmail" type="email" placeholder="name@company.com" autocomplete="email" />
        </label>
        <label class="auth-field">
          <span class="auth-label">รหัสผ่าน</span>
          <input id="authPassword" type="password" placeholder="กรอกรหัสผ่าน" autocomplete="current-password" />
        </label>
      </div>
      <div class="auth-actions">
        <button class="btn primary" id="signInBtn" type="button">เข้าสู่ระบบ</button>
        <button class="btn" id="signOutBtn" type="button">ออกจากระบบ</button>
      </div>
      <div class="auth-helper">
        <span>เมื่อเข้าสู่ระบบแล้ว หน้าแอดมินจะใช้ session นี้เรียก Supabase Edge Function อัตโนมัติ</span>
        <span>รองรับการกด Enter เพื่อเข้าสู่ระบบ</span>
      </div>
      <div class="auth-user" id="authUserCard" data-visible="false">
        <strong id="authUserLabel">ยังไม่มีผู้ใช้</strong>
      </div>
    `;
    heroSide.prepend(authWrap);
  }

  function updateAuthUi(){
    const authStack = document.querySelector('.auth-stack');
    const authStatus = $('authStatus');
    const authUserCard = $('authUserCard');
    const authUserLabel = $('authUserLabel');
    const signOutBtn = $('signOutBtn');
    const authEmail = $('authEmail');
    const authPassword = $('authPassword');
    if(!authStatus) return;

    if(currentAdminUser){
      if(authStack) authStack.classList.add('is-signed-in');
      authStatus.dataset.state = 'signed-in';
      authStatus.textContent = 'เชื่อมต่อแล้ว';
      if(authUserCard) authUserCard.dataset.visible = 'true';
      if(authUserLabel) authUserLabel.textContent = currentAdminUser.email || currentAdminUser.id || 'ผู้ดูแลระบบ';
      if(signOutBtn) signOutBtn.disabled = false;
      if(authEmail && currentAdminUser.email) authEmail.value = currentAdminUser.email;
      if(authPassword) authPassword.value = '';
    }else{
      hasInitializedAdminData = false;
      if(authStack) authStack.classList.remove('is-signed-in');
      authStatus.dataset.state = 'signed-out';
      authStatus.textContent = 'ยังไม่ได้เข้าสู่ระบบ';
      if(authUserCard) authUserCard.dataset.visible = 'false';
      if(authUserLabel) authUserLabel.textContent = 'ยังไม่มีผู้ใช้';
      if(signOutBtn) signOutBtn.disabled = true;
    }

    applyAuthGate();
  }

  async function getAccessToken(){
    const { data, error } = await sbClient.auth.getSession();
    if(error) throw error;
    const token = data && data.session && data.session.access_token ? data.session.access_token : '';
    if(!token){
      throw new Error('กรุณาเข้าสู่ระบบ Supabase Auth ก่อนใช้งาน');
    }
    return token;
  }

  async function refreshAuthState(){
    const { data, error } = await sbClient.auth.getUser();
    currentAdminUser = !error && data ? data.user : null;
    updateAuthUi();
  }

  async function signInAdmin(){
    const email = ($('authEmail')?.value || '').trim();
    const password = $('authPassword')?.value || '';
    const signInBtn = $('signInBtn');

    if(!email || !password){
      setStatus('กรอกอีเมลและรหัสผ่านก่อนเข้าสู่ระบบ', 'error');
      return;
    }

    setStatus('กำลังเข้าสู่ระบบ...', 'info');
    if(signInBtn) signInBtn.disabled = true;

    try{
      const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
      if(error) throw error;
      currentAdminUser = data.user || null;
      updateAuthUi();
      await initializeAdminAfterAuth();
      setStatus('เข้าสู่ระบบสำเร็จ', 'success');
      stampActivity('เข้าสู่ระบบแล้ว');
      $('authPassword').value = '';
    }catch(e){
      console.error(e);
      setStatus('เข้าสู่ระบบไม่สำเร็จ: ' + (e.message || e), 'error');
    }finally{
      if(signInBtn) signInBtn.disabled = false;
    }
  }

  async function signOutAdmin(){
    const signOutBtn = $('signOutBtn');
    try{
      if(signOutBtn) signOutBtn.disabled = true;
      const { error } = await sbClient.auth.signOut();
      if(error) throw error;
      currentAdminUser = null;
      updateAuthUi();
      setStatus('ออกจากระบบแล้ว', 'info');
      stampActivity('ออกจากระบบแล้ว');
    }catch(e){
      console.error(e);
      setStatus('ออกจากระบบไม่สำเร็จ: ' + (e.message || e), 'error');
      if(signOutBtn) signOutBtn.disabled = false;
    }
  }

  function buildEdgeUrl(action, query = {}){
    const url = new URL(EDGE_FUNCTION_URL);
    url.searchParams.set('action', action);
    Object.entries(query).forEach(([key, value]) => {
      if(value !== undefined && value !== null && value !== ''){
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  }

  async function callAdminApi(action, { method = 'GET', query = {}, body } = {}){
    const token = await getAccessToken();

    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    };

    if(method !== 'GET'){
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(buildEdgeUrl(action, query), {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    });

    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.success === false){
      throw new Error(data.error || `Edge Function error (${res.status})`);
    }
    return data;
  }

  function getPublicStorageUrl(objectPath){
    const normalized = String(objectPath || '')
      .split('/')
      .filter(Boolean)
      .map(part => encodeURIComponent(part))
      .join('/');
    return normalized
      ? `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${normalized}`
      : '';
  }

  async function fileToBase64(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์เพื่ออัปโหลดได้'));
      reader.readAsDataURL(file);
    });
  }

  function stampActivity(label){
    if(lastActionLabel) lastActionLabel.textContent = label;
    if(lastActionTime) lastActionTime.textContent = new Date().toLocaleString();
  }

  function setStatus(msg, tone = 'info'){
    status.textContent = msg;
    status.dataset.tone = tone;
  }

  function syncEntitySummary(){
    const ent = $('entitySelect').value;
    const cfg = entityMap[ent];
    entityLabel.textContent = cfg.display;
    entityTableName.textContent = cfg.table;
  }

  function slugifyKeyPart(value){
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  function getEntityKeyPrefix(){
    const ent = $('entitySelect').value;
    if(ent === 'room_scenes') return 'scene';
    if(ent === 'door_products') return 'door';
    return 'handle';
  }

  function getEntityKeyColumn(){
    const ent = $('entitySelect').value;
    if(ent === 'room_scenes') return 'scene_key';
    if(ent === 'door_products') return 'door_key';
    return 'handle_key';
  }

  function getEntityStorageFolder(){
    const ent = $('entitySelect').value;
    if(ent === 'room_scenes') return 'rooms';
    if(ent === 'door_products') return 'doors';
    return 'handles';
  }

  function resolveStorageObjectPath(rawValue){
    const value = String(rawValue || '').trim();
    if(!value) return '';

    if(/^https?:\/\//i.test(value)){
      try{
        const url = new URL(value);
        const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
        const markerIndex = url.pathname.indexOf(marker);
        if(markerIndex >= 0){
          return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
        }
      }catch(e){
        console.warn('ไม่สามารถแปลง URL รูปภาพได้', e);
      }
      return '';
    }

    const cleanedValue = value.replace(/^\/+/g, '');
    const bucketPrefix = `${STORAGE_BUCKET}/`;
    const withoutBucket = cleanedValue.startsWith(bucketPrefix) ? cleanedValue.slice(bucketPrefix.length) : cleanedValue;
    const folder = getEntityStorageFolder();
    return withoutBucket.includes('/') ? withoutBucket : `${folder}/${withoutBucket}`;
  }

  async function deleteStorageObjectByImagePath(imagePath){
    const objectPath = resolveStorageObjectPath(imagePath);
    if(!objectPath){
      return { skipped:true };
    }
    return { skipped:false, objectPath };
  }

  function buildAutoKeyFromName(nameValue){
    const slug = slugifyKeyPart(nameValue);
    const prefix = getEntityKeyPrefix();
    return slug ? `${prefix}-${slug}` : `${prefix}-item`;
  }

  async function getUniqueAutoKey(baseKey){
    const ent = $('entitySelect').value;
    const cfg = entityMap[ent];
    const keyCol = getEntityKeyColumn();
    const rootKey = baseKey || `${getEntityKeyPrefix()}-item`;

    try{
      const { data, error } = await sbClient
        .from(cfg.table)
        .select(keyCol)
        .ilike(keyCol, `${rootKey}%`);

      if(error) throw error;

      const taken = new Set((data || []).map(row => String(row[keyCol] || '').toLowerCase()));
      if(!taken.has(rootKey.toLowerCase())){
        return rootKey;
      }

      let suffix = 2;
      while(taken.has(`${rootKey}-${suffix}`.toLowerCase())){
        suffix += 1;
      }
      return `${rootKey}-${suffix}`;
    }catch(e){
      console.warn('ไม่สามารถสร้างคีย์ที่ไม่ซ้ำได้', e);
      return rootKey;
    }
  }

  async function syncAutoKeyFromName(force = false){
    if(!force && !autoKeySyncEnabled) return;
    const keyInput = $('f_key');
    const requestId = ++autoKeyRequestId;
    const baseKey = buildAutoKeyFromName($('f_name').value);
    const nextKey = await getUniqueAutoKey(baseKey);
    if(requestId !== autoKeyRequestId) return;
    if(!force && !autoKeySyncEnabled) return;
    keyInput.value = nextKey;
    keyInput.dataset.autoGenerated = 'true';
  }

  async function getNextSortOrder(){
    const ent = $('entitySelect').value;
    const cfg = entityMap[ent];

    try{
      const { data, error } = await sbClient
        .from(cfg.table)
        .select('sort_order')
        .order('sort_order', { ascending:false })
        .limit(1);

      if(error) throw error;

      const maxSort = Array.isArray(data) && data.length > 0
        ? Number(data[0].sort_order) || 0
        : 0;

      return maxSort + 1;
    }catch(e){
      console.warn('ไม่สามารถคำนวณลำดับถัดไปได้', e);
      return 1;
    }
  }

  function getImagePreviewSrc(rawValue){
    const value = String(rawValue || '').trim();
    if(!value) return '';
    if(/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')){
      return value;
    }

    const objectPath = resolveStorageObjectPath(value);
    if(!objectPath) return '';

    const { data } = sbClient.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
    return data && data.publicUrl ? data.publicUrl : '';
  }

  function renderCellValue(fieldName, value){
    if(fieldName === 'image_path'){
      const previewSrc = getImagePreviewSrc(value);
      if(previewSrc){
        return `
          <div class="image-cell">
            <img
              class="thumb-preview"
              src="${previewSrc}"
              data-preview-src="${previewSrc}"
              data-preview-label="${String(value || '').replace(/"/g, '&quot;')}"
              alt="ภาพตัวอย่าง"
              loading="lazy"
              onerror="this.outerHTML='<div class=&quot;thumb-fallback&quot;>แสดงรูปไม่สำเร็จ</div>'"
            />
          </div>`;
      }
      return '<div class="thumb-fallback">ไม่มีรูปภาพ</div>';
    }

    return String(value === undefined ? '' : value);
  }

  function cleanupLocalPreviewObjectUrl(){
    if(localPreviewObjectUrl){
      URL.revokeObjectURL(localPreviewObjectUrl);
      localPreviewObjectUrl = '';
    }
  }

  function setPreviewBoxContent(html){
    const previewBox = $('imagePreviewBox');
    if(previewBox) previewBox.innerHTML = html;
  }

  function showEmptyPreview(message = 'ยังไม่มีรูปตัวอย่าง'){
    cleanupLocalPreviewObjectUrl();
    setPreviewBoxContent(`<div class="form-preview-empty">${message}</div>`);
  }

  function showPreviewFromUrl(src, altText = 'ภาพตัวอย่าง'){
    if(!src){
      showEmptyPreview();
      return;
    }
    cleanupLocalPreviewObjectUrl();
    setPreviewBoxContent(`<img src="${src}" alt="${altText}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;form-preview-empty&quot;>แสดงรูปตัวอย่างไม่สำเร็จ</div>'" />`);
  }

  function showPreviewFromFile(file){
    if(!file){
      showEmptyPreview();
      return;
    }
    cleanupLocalPreviewObjectUrl();
    localPreviewObjectUrl = URL.createObjectURL(file);
    setPreviewBoxContent(`<img src="${localPreviewObjectUrl}" alt="à¸ à¸²à¸žà¸—à¸µà¹ˆà¹€à¸¥à¸·à¸­à¸" />`);
  }

  function openImageModal(src, label = ''){
    if(!imageModal || !imageModalImg || !src) return;
    imageModalImg.src = src;
    imageModalImg.alt = label || 'รูปภาพขนาดใหญ่';
    if(imageModalTitle){
      imageModalTitle.textContent = label ? `ดูรูปภาพขนาดใหญ่: ${label}` : 'ดูรูปภาพขนาดใหญ่';
    }
    imageModal.hidden = false;
    imageModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeImageModal(){
    if(!imageModal || !imageModalImg) return;
    imageModal.hidden = true;
    imageModal.setAttribute('aria-hidden', 'true');
    imageModalImg.src = '';
    imageModalImg.alt = 'รูปภาพขนาดใหญ่';
    if(imageModalTitle){
      imageModalTitle.textContent = 'ดูรูปภาพขนาดใหญ่';
    }
    document.body.style.overflow = '';
  }

  function renderList(cfg, rows){
    const container = $('listContainer');
    if(!rows || rows.length === 0){
      container.innerHTML = `
        <div class="list-shell">
          <div class="list-meta">
            <div>
              <div class="entity-chip">${cfg.display}</div>
              <div class="muted" style="margin-top:6px">${cfg.table}</div>
            </div>
            <div class="muted">0 รายการ</div>
          </div>
          <div class="empty-state">ไม่พบข้อมูลใน <code>${cfg.table}</code> หรือ ตารางนี้ยังไม่มีรายการ</div>
        </div>`;
      return;
    }

    let html = `
      <div class="list-shell">
        <div class="list-meta">
          <div>
            <div class="entity-chip">${cfg.display}</div>
            <div class="muted" style="margin-top:6px">${cfg.table}</div>
          </div>
          <div class="muted">โหลดแล้ว ${rows.length} รายการ</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>${cfg.fields.map(f => `<th>${fieldLabelMap[f] || f}</th>`).join('')}<th>จัดการ</th></tr>
            </thead>
            <tbody>`;

    rows.forEach(r => {
      const keyValue = r.scene_key || r.door_key || r.handle_key || r.id || '';
      html += '<tr>' + cfg.fields.map((f, index) => `<td class="${index === 0 ? 'cell-strong' : ''}">${renderCellValue(f, r[f])}</td>`).join('') +
        `<td><button class="btn small" data-key="${keyValue}">แก้ไข</button></td></tr>`;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>`;

    container.innerHTML = html;

    container.querySelectorAll('button[data-key]').forEach(button => {
      button.addEventListener('click', () => populateFormByKey(button.dataset.key));
    });
  }

  async function listEntities(){
    const ent = $('entitySelect').value;
    const cfg = entityMap[ent];
    syncEntitySummary();
    setStatus('กำลังโหลด ' + cfg.display + ' ...', 'info');

    try{
      const { data, error } = await sbClient
        .from(cfg.table)
        .select('*')
        .order('sort_order', { ascending:true })
        .order('name', { ascending:true });

      if(error) throw error;

      const rows = data || [];
      renderList(cfg, rows);
      entityCount.textContent = String(rows.length);
      setStatus(`พบ ${rows.length} รายการ`, 'success');
      stampActivity('รีเฟรชรายการ');
    }catch(e){
      console.error(e);
      entityCount.textContent = '0';
      renderList(cfg, []);
      setStatus('โหลดข้อมูลไม่สำเร็จ: ' + (e.message || e), 'error');
      stampActivity('โหลดข้อมูลไม่สำเร็จ');
    }
  }

  async function populateFormByKey(key){
    const ent = $('entitySelect').value;
    const cfg = entityMap[ent];
    setStatus('กำลังโหลดรายการ...', 'info');

    try{
      const keyCols = ['scene_key','door_key','handle_key','id'];
      let row = null;

      for(const col of keyCols){
        const { data, error } = await sbClient.from(cfg.table).select('*').eq(col, key).limit(1).single();
        if(!error && data){
          row = data;
          break;
        }
      }

      if(!row){
        setStatus('ไม่พบรายการ', 'error');
        return;
      }

      $('f_key').value = row.scene_key || row.door_key || row.handle_key || row.id || '';
      $('f_key').dataset.autoGenerated = 'false';
      $('f_name').value = row.name || '';
      $('f_image').value = row.image_path || '';
      $('f_w').value = row.width || row.canvas_w || '';
      $('f_h').value = row.height || row.canvas_h || '';
      $('f_floor').value = row.floor_frac || row.bottom_frac || '0.9600';
      $('f_sort').value = row.sort_order || 0;
      $('f_active').value = String(row.is_active === false ? 'false' : 'true');
      $('formMode').textContent = 'กำลังแก้ไข: ' + $('f_key').value;
      autoKeySyncEnabled = false;
      showPreviewFromUrl(getImagePreviewSrc(row.image_path), 'ภาพรายการปัจจุบัน');

      setStatus('โหลดฟอร์มเรียบร้อย', 'success');
      stampActivity('เปิดรายการเพื่อแก้ไข');
    }catch(e){
      console.error(e);
      setStatus('ข้อผิดพลาด: ' + (e.message || e), 'error');
    }
  }

  async function clearForm(){
    ['f_key','f_name','f_image','f_w','f_h'].forEach(id => $(id).value = '');
    $('f_floor').value = '0.9600';
    $('f_sort').value = String(await getNextSortOrder());
    $('f_active').value = 'true';
    $('formMode').textContent = 'รายการใหม่';
    autoKeySyncEnabled = true;
    $('f_key').dataset.autoGenerated = 'true';
    $('fileInput').value = '';
    showEmptyPreview('เลือกไฟล์รูปหรือเลือกรายการเดิม เพื่อให้แสดงตัวอย่างรูปทันที');
    await syncAutoKeyFromName(true);
  }

  async function upsertEntity(){
    const ent = $('entitySelect').value;
    const cfg = entityMap[ent];
    const key = $('f_key').value.trim();

    if(!key){
      setStatus('ระบุ key ก่อนบันทึก', 'error');
      return;
    }

    const payload = {};

    if(ent === 'room_scenes'){
      payload.scene_key = key;
      payload.name = $('f_name').value.trim();
      payload.image_path = $('f_image').value.trim();
      if($('f_w').value) payload.width = Number($('f_w').value);
      if($('f_h').value) payload.height = Number($('f_h').value);
      if($('f_floor').value) payload.floor_frac = Number($('f_floor').value);
      if($('f_sort').value) payload.sort_order = Number($('f_sort').value);
      payload.is_active = $('f_active').value === 'true';
    } else if(ent === 'door_products'){
      payload.door_key = key;
      payload.name = $('f_name').value.trim();
      payload.image_path = $('f_image').value.trim();
      if($('f_w').value) payload.canvas_w = Number($('f_w').value);
      if($('f_h').value) payload.canvas_h = Number($('f_h').value);
      if($('f_floor').value) payload.bottom_frac = Number($('f_floor').value);
      if($('f_sort').value) payload.sort_order = Number($('f_sort').value);
      payload.is_active = $('f_active').value === 'true';
    } else {
      payload.handle_key = key;
      payload.name = $('f_name').value.trim();
      payload.image_path = $('f_image').value.trim();
      if($('f_sort').value) payload.sort_order = Number($('f_sort').value);
      payload.is_active = $('f_active').value === 'true';
    }

    try{
      const conflictCol = ent === 'room_scenes' ? 'scene_key' : (ent === 'door_products' ? 'door_key' : 'handle_key');
      const { error } = await sbClient.from(cfg.table).upsert(payload, { onConflict: conflictCol });
      if(error) throw error;

      setStatus('บันทึกเรียบร้อย', 'success');
      stampActivity('บันทึกรายการแล้ว');
      listEntities();
    }catch(e){
      console.error(e);
      setStatus('บันทึกไม่สำเร็จ: ' + (e.message || e), 'error');
    }
  }

  async function readImageDimensions(file){
    return new Promise((resolve, reject) => {
      if(!file){
        resolve(null);
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        const dimensions = { width: img.naturalWidth, height: img.naturalHeight };
        URL.revokeObjectURL(objectUrl);
        resolve(dimensions);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('ไม่สามารถอ่านขนาดรูปภาพได้'));
      };

      img.src = objectUrl;
    });
  }

  async function syncDimensionsFromSelectedFile(){
    const fileEl = $('fileInput');
    const statusEl = $('uploadStatus');
    if(!fileEl.files || fileEl.files.length === 0) return;

    try{
      showPreviewFromFile(fileEl.files[0]);
      const dimensions = await readImageDimensions(fileEl.files[0]);
      if(!dimensions) return;
      $('f_w').value = String(dimensions.width || '');
      $('f_h').value = String(dimensions.height || '');
      statusEl.textContent = `อ่านขนาดรูปแล้ว: ${dimensions.width} x ${dimensions.height} พิกเซล`;
      statusEl.style.color = 'var(--blue)';
    }catch(e){
      console.error(e);
      statusEl.textContent = 'ไม่สามารถอ่านขนาดรูปภาพได้';
      statusEl.style.color = 'var(--red)';
    }
  }

  async function uploadFile(){
    const fileEl = $('fileInput');
    const folder = $('uploadFolder').value || 'rooms';
    const statusEl = $('uploadStatus');

    if(!fileEl.files || fileEl.files.length === 0){
      statusEl.textContent = 'โปรดเลือกไฟล์ก่อน';
      statusEl.style.color = 'var(--red)';
      return;
    }

    const file = fileEl.files[0];
    const bucket = STORAGE_BUCKET;
    const filename = `${folder}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'')}`;

    statusEl.textContent = 'กำลังอัปโหลด...';
    statusEl.style.color = 'var(--blue)';

    try{
      const { data: uploadData, error: uploadError } = await sbClient.storage.from(bucket).upload(filename, file, { upsert: true });
      if(uploadError) throw uploadError;

      const { data: publicData, error: publicError } = await sbClient.storage.from(bucket).getPublicUrl(filename);
      if(publicError) throw publicError;

      const publicUrl = publicData && publicData.publicUrl ? publicData.publicUrl : filename;
      $('f_image').value = publicUrl;
      statusEl.textContent = 'อัปโหลดสำเร็จ';
      statusEl.style.color = 'var(--green)';
      stampActivity('อัปโหลดรูปสำเร็จ');
      appendDebug('upload: ' + JSON.stringify({ filename, uploadData, publicUrl }));
    }catch(e){
      console.error('Upload failed', e);
      statusEl.textContent = 'อัปโหลดไม่สำเร็จ: ' + (e.message || e);
      statusEl.style.color = 'var(--red)';
      appendDebug('upload error: ' + (e.message || String(e)));
    }
  }

  async function deleteEntity(){
    const ent = $('entitySelect').value;
    const cfg = entityMap[ent];
    const key = $('f_key').value.trim();

    if(!key){
      setStatus('ระบุ key ที่ต้องการลบ', 'error');
      return;
    }

    if(!confirm('ลบรายการจริงหรือไม่? ' + key)) return;

    try{
      const keyCols = cfg.table === 'room_scenes' ? ['scene_key'] : (cfg.table === 'door_products' ? ['door_key'] : ['handle_key']);
      let res = null;

      for(const col of keyCols){
        res = await sbClient.from(cfg.table).delete().eq(col, key);
        if(!res.error) break;
      }

      if(res && res.error) throw res.error;

      setStatus('ลบเรียบร้อย', 'success');
      stampActivity('ลบรายการแล้ว');
      listEntities();
      clearForm();
    }catch(e){
      console.error(e);
      setStatus('ลบไม่สำเร็จ: ' + (e.message || e), 'error');
    }
  }

  async function deleteEntityWithImage(){
    const ent = $('entitySelect').value;
    const cfg = entityMap[ent];
    const key = $('f_key').value.trim();
    const imagePath = $('f_image').value.trim();

    if(!key){
      setStatus('ระบุคีย์ที่ต้องการลบ', 'error');
      return;
    }

    if(!confirm('ลบรายการจริงหรือไม่? ' + key)) return;

    try{
      const keyCols = cfg.table === 'room_scenes' ? ['scene_key'] : (cfg.table === 'door_products' ? ['door_key'] : ['handle_key']);
      let res = null;

      for(const col of keyCols){
        res = await sbClient.from(cfg.table).delete().eq(col, key);
        if(!res.error) break;
      }

      if(res && res.error) throw res.error;

      let storageDeleted = false;
      try{
        const storageResult = await deleteStorageObjectByImagePath(imagePath);
        storageDeleted = !storageResult.skipped;
        if(storageDeleted){
          appendDebug('delete image: ' + JSON.stringify(storageResult));
        }
      }catch(storageError){
        console.error('Storage delete failed', storageError);
        appendDebug('delete image error: ' + (storageError.message || String(storageError)));
        setStatus('ลบข้อมูลสำเร็จ แต่ลบรูปใน Storage ไม่สำเร็จ: ' + (storageError.message || storageError), 'error');
        stampActivity('ลบข้อมูลแล้ว แต่ลบรูปไม่สำเร็จ');
        listEntities();
        clearForm();
        return;
      }

      setStatus(storageDeleted ? 'ลบรายการและรูปใน Storage เรียบร้อย' : 'ลบรายการเรียบร้อย', 'success');
      stampActivity(storageDeleted ? 'ลบรายการและรูปแล้ว' : 'ลบรายการแล้ว');
      listEntities();
      clearForm();
    }catch(e){
      console.error(e);
      setStatus('ลบไม่สำเร็จ: ' + (e.message || e), 'error');
    }
  }

  async function testConnection(){
    setStatus('กำลังทดสอบการเชื่อมต่อ...', 'info');

    try{
      const res = await sbClient.from('room_scenes').select('id').limit(1).maybeSingle();
      const { data, error } = res || {};
      if(error) throw error;

      if(data){
        setStatus('เชื่อมต่อสำเร็จ - พบอย่างน้อย 1 แถว', 'success');
      } else {
        setStatus('เชื่อมต่อสำเร็จ - แต่ยังไม่พบข้อมูลใน room_scenes', 'success');
      }

      stampActivity('ทดสอบการเชื่อมต่อแล้ว');
      appendDebug('testConnection result: ' + JSON.stringify(res));
    }catch(e){
      console.error('Test connection failed', e);
      setStatus('การเชื่อมต่อไม่สำเร็จ: ' + (e.message || e), 'error');
      stampActivity('เชื่อมต่อไม่สำเร็จ');
      appendDebug(e && e.message ? e.message : String(e));
    }
  }

  function appendDebug(msg){
    try{
      const el = $('debugLog');
      el.style.display = 'block';
      const ts = new Date().toISOString();
      el.textContent = ts + ' - ' + msg + '\n' + el.textContent;
    }catch(e){
      console.warn(e);
    }
  }

  async function getUniqueAutoKey(baseKey){
    const rootKey = baseKey || `${getEntityKeyPrefix()}-item`;

    try{
      const ent = $('entitySelect').value;
      const result = await callAdminApi('unique-key', {
        query: { entity: ent, baseKey: rootKey }
      });
      return result.key || rootKey;
    }catch(e){
      console.warn('ไม่สามารถสร้างคีย์ที่ไม่ซ้ำได้', e);
      return rootKey;
    }
  }

  async function getNextSortOrder(){
    const ent = $('entitySelect').value;

    try{
      const result = await callAdminApi('next-sort', {
        query: { entity: ent }
      });
      return Number(result.sortOrder) || 1;
    }catch(e){
      console.warn('ไม่สามารถคำนวณลำดับถัดไปได้', e);
      return 1;
    }
  }

  function getImagePreviewSrc(rawValue){
    const value = String(rawValue || '').trim();
    if(!value) return '';
    if(/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')){
      return value;
    }

    const objectPath = resolveStorageObjectPath(value);
    return objectPath ? getPublicStorageUrl(objectPath) : '';
  }

  async function listEntities(){
    const ent = $('entitySelect').value;
    const cfg = entityMap[ent];
    syncEntitySummary();
    setStatus('กำลังโหลด ' + cfg.display + ' ...', 'info');

    try{
      const result = await callAdminApi('list', {
        query: { entity: ent }
      });

      const rows = result.rows || [];
      renderList(cfg, rows);
      entityCount.textContent = String(rows.length);
      setStatus(`พบ ${rows.length} รายการ`, 'success');
      stampActivity('รีเฟรชรายการ');
    }catch(e){
      console.error(e);
      entityCount.textContent = '0';
      renderList(cfg, []);
      setStatus('โหลดข้อมูลไม่สำเร็จ: ' + (e.message || e), 'error');
      stampActivity('โหลดข้อมูลไม่สำเร็จ');
    }
  }

  async function populateFormByKey(key){
    const ent = $('entitySelect').value;
    setStatus('กำลังโหลดรายการ...', 'info');

    try{
      const result = await callAdminApi('item', {
        query: { entity: ent, key }
      });
      const row = result.row;

      if(!row){
        setStatus('ไม่พบรายการ', 'error');
        return;
      }

      $('f_key').value = row.scene_key || row.door_key || row.handle_key || row.id || '';
      $('f_key').dataset.autoGenerated = 'false';
      $('f_name').value = row.name || '';
      $('f_image').value = row.image_path || '';
      $('f_w').value = row.width || row.canvas_w || '';
      $('f_h').value = row.height || row.canvas_h || '';
      $('f_floor').value = row.floor_frac || row.bottom_frac || '0.9600';
      $('f_sort').value = row.sort_order || 0;
      $('f_active').value = String(row.is_active === false ? 'false' : 'true');
      $('formMode').textContent = 'กำลังแก้ไข: ' + $('f_key').value;
      autoKeySyncEnabled = false;
      showPreviewFromUrl(getImagePreviewSrc(row.image_path), 'ภาพรายการปัจจุบัน');

      setStatus('โหลดฟอร์มเรียบร้อย', 'success');
      stampActivity('เปิดรายการเพื่อแก้ไข');
    }catch(e){
      console.error(e);
      setStatus('ข้อผิดพลาด: ' + (e.message || e), 'error');
    }
  }

  async function upsertEntity(){
    const ent = $('entitySelect').value;
    const key = $('f_key').value.trim();

    if(!key){
      setStatus('ระบุ key ก่อนบันทึก', 'error');
      return;
    }

    const payload = {};

    if(ent === 'room_scenes'){
      payload.scene_key = key;
      payload.name = $('f_name').value.trim();
      payload.image_path = $('f_image').value.trim();
      if($('f_w').value) payload.width = Number($('f_w').value);
      if($('f_h').value) payload.height = Number($('f_h').value);
      if($('f_floor').value) payload.floor_frac = Number($('f_floor').value);
      if($('f_sort').value) payload.sort_order = Number($('f_sort').value);
      payload.is_active = $('f_active').value === 'true';
    } else if(ent === 'door_products'){
      payload.door_key = key;
      payload.name = $('f_name').value.trim();
      payload.image_path = $('f_image').value.trim();
      if($('f_w').value) payload.canvas_w = Number($('f_w').value);
      if($('f_h').value) payload.canvas_h = Number($('f_h').value);
      if($('f_floor').value) payload.bottom_frac = Number($('f_floor').value);
      if($('f_sort').value) payload.sort_order = Number($('f_sort').value);
      payload.is_active = $('f_active').value === 'true';
    } else {
      payload.handle_key = key;
      payload.name = $('f_name').value.trim();
      payload.image_path = $('f_image').value.trim();
      if($('f_sort').value) payload.sort_order = Number($('f_sort').value);
      payload.is_active = $('f_active').value === 'true';
    }

    try{
      await callAdminApi('upsert', {
        method: 'POST',
        body: { entity: ent, payload }
      });

      setStatus('บันทึกเรียบร้อย', 'success');
      stampActivity('บันทึกรายการแล้ว');
      await listEntities();
    }catch(e){
      console.error(e);
      setStatus('บันทึกไม่สำเร็จ: ' + (e.message || e), 'error');
    }
  }

  async function uploadFile(){
    const fileEl = $('fileInput');
    const folder = $('uploadFolder').value || 'rooms';
    const statusEl = $('uploadStatus');

    if(!fileEl.files || fileEl.files.length === 0){
      statusEl.textContent = 'โปรดเลือกไฟล์ก่อน';
      statusEl.style.color = 'var(--red)';
      return;
    }

    const file = fileEl.files[0];
    statusEl.textContent = 'กำลังอัปโหลด...';
    statusEl.style.color = 'var(--blue)';

    try{
      const base64Data = await fileToBase64(file);
      const result = await callAdminApi('upload', {
        method: 'POST',
        body: {
          folder,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          base64Data
        }
      });

      $('f_image').value = result.publicUrl || result.objectPath || '';
      statusEl.textContent = 'อัปโหลดสำเร็จ';
      statusEl.style.color = 'var(--green)';
      stampActivity('อัปโหลดรูปสำเร็จ');
      appendDebug('upload: ' + JSON.stringify(result));
      showPreviewFromUrl($('f_image').value, 'ภาพที่อัปโหลดแล้ว');
    }catch(e){
      console.error('Upload failed', e);
      statusEl.textContent = 'อัปโหลดไม่สำเร็จ: ' + (e.message || e);
      statusEl.style.color = 'var(--red)';
      appendDebug('upload error: ' + (e.message || String(e)));
    }
  }

  async function deleteEntityWithImage(){
    const ent = $('entitySelect').value;
    const key = $('f_key').value.trim();
    const imagePath = $('f_image').value.trim();

    if(!key){
      setStatus('ระบุคีย์ที่ต้องการลบ', 'error');
      return;
    }

    if(!confirm('ลบรายการจริงหรือไม่? ' + key)) return;

    try{
      const result = await callAdminApi('delete', {
        method: 'POST',
        body: { entity: ent, key, imagePath }
      });

      setStatus(
        result.storageDeleted
          ? 'ลบรายการและรูปใน Storage เรียบร้อย'
          : 'ลบรายการเรียบร้อย',
        'success'
      );
      stampActivity(
        result.storageDeleted
          ? 'ลบรายการและรูปแล้ว'
          : 'ลบรายการแล้ว'
      );
      appendDebug('delete: ' + JSON.stringify(result));
      await listEntities();
      await clearForm();
    }catch(e){
      console.error(e);
      setStatus('ลบไม่สำเร็จ: ' + (e.message || e), 'error');
    }
  }

  async function testConnection(){
    setStatus('กำลังทดสอบการเชื่อมต่อ...', 'info');

    try{
      const result = await callAdminApi('test');
      const hasData = !!(result && result.data);
      setStatus(
        hasData
          ? 'เชื่อมต่อสำเร็จ - พบข้อมูลตัวอย่าง'
          : 'เชื่อมต่อสำเร็จ - ยังไม่พบข้อมูลใน room_scenes',
        'success'
      );
      stampActivity('ทดสอบการเชื่อมต่อแล้ว');
      appendDebug('testConnection result: ' + JSON.stringify(result));
    }catch(e){
      console.error('Test connection failed', e);
      setStatus('การเชื่อมต่อไม่สำเร็จ: ' + (e.message || e), 'error');
      stampActivity('เชื่อมต่อไม่สำเร็จ');
      appendDebug(e && e.message ? e.message : String(e));
    }
  }

  async function callAdminApi(action, { method = 'GET', query = {}, body } = {}){
    const token = await getAccessToken();

    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    };

    if(method !== 'GET'){
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(buildEdgeUrl(action, query), {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    });

    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.success === false){
      throw new Error(data.error || `Edge Function error (${res.status})`);
    }
    return data;
  }

  $('uploadBtn').addEventListener('click', uploadFile);
  mountAuthUi();
  $('signInBtn').addEventListener('click', signInAdmin);
  $('signOutBtn').addEventListener('click', signOutAdmin);
  $('authEmail').addEventListener('keydown', (event) => {
    if(event.key === 'Enter'){
      event.preventDefault();
      signInAdmin();
    }
  });
  $('authPassword').addEventListener('keydown', (event) => {
    if(event.key === 'Enter'){
      event.preventDefault();
      signInAdmin();
    }
  });
  sbClient.auth.onAuthStateChange((_event, session) => {
    currentAdminUser = session && session.user ? session.user : null;
    updateAuthUi();
    if(currentAdminUser){
      initializeAdminAfterAuth();
    }
  });
  $('fileInput').addEventListener('change', syncDimensionsFromSelectedFile);
  $('testConnBtn').addEventListener('click', testConnection);
  $('refreshBtn').addEventListener('click', listEntities);
  $('f_name').addEventListener('input', async () => {
    await syncAutoKeyFromName();
  });
  $('f_key').addEventListener('input', () => {
    const expectedAutoKey = buildAutoKeyFromName($('f_name').value);
    autoKeySyncEnabled = $('f_key').value.trim() === '' || $('f_key').value === expectedAutoKey;
    $('f_key').dataset.autoGenerated = autoKeySyncEnabled ? 'true' : 'false';
  });
  $('newBtn').addEventListener('click', async () => {
    await clearForm();
    setStatus('พร้อมสร้างรายการใหม่', 'info');
    stampActivity('โหมดสร้างรายการใหม่');
  });
  $('entitySelect').addEventListener('change', async () => {
    await clearForm();
    syncEntitySummary();
    listEntities();
  });
  $('clearFormBtn').addEventListener('click', clearForm);
  $('upsertBtn').addEventListener('click', upsertEntity);
  $('deleteBtn').addEventListener('click', deleteEntityWithImage);
  $('saveBtn').addEventListener('click', upsertEntity);
  $('listContainer').addEventListener('click', (event) => {
    const target = event.target;
    if(!(target instanceof HTMLElement)) return;
    if(!target.classList.contains('thumb-preview')) return;

    const previewSrc = target.getAttribute('data-preview-src') || target.getAttribute('src') || '';
    const previewLabel = target.getAttribute('data-preview-label') || target.getAttribute('alt') || '';
    openImageModal(previewSrc, previewLabel);
  });
  imageModal?.addEventListener('click', (event) => {
    const target = event.target;
    if(!(target instanceof HTMLElement)) return;
    if(target.dataset.closeImageModal === 'true' || target.id === 'imageModalClose'){
      closeImageModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if(event.key === 'Escape' && imageModal && !imageModal.hidden){
      closeImageModal();
    }
  });

  refreshAuthState().then(() => {
    if(currentAdminUser){
      initializeAdminAfterAuth();
    }else{
      applyAuthGate();
    }
  });
