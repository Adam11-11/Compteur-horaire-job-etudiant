// ==========================================
// GESTION DES PHOTOS DE PREUVE (COMPRESSION, FORMULAIRE & VISIONNEUSE)
// ==========================================
function triggerFormPhotoPick() {
  const inp = document.getElementById('form-photo-input');
  if (inp) {
    inp.value = '';
    inp.click();
  }
}

function updateFormPhotoUI() {
  const block = document.getElementById('form-photo-dropzone');
  const thumb = document.getElementById('form-photo-thumb');
  const title = document.getElementById('form-photo-title');
  const sub = document.getElementById('form-photo-sub');
  const pickBtn = document.getElementById('form-photo-pick-btn');
  const clearBtn = document.getElementById('form-photo-clear-btn');

  if (formSelectedPhotoFile) {
    block.classList.add('has-photo');
    if (formPhotoPreviewUrl) thumb.src = formPhotoPreviewUrl;
    title.textContent = '✓ PHOTO PRÊTE';
    sub.textContent = `${formSelectedPhotoFile.name || 'Image'} (${Math.max(1, Math.round(formSelectedPhotoFile.size / 1024))} Ko)`;
    sub.style.display = 'block';
    pickBtn.innerHTML = `${CAM_SVG} CHANGER`;
    clearBtn.style.display = 'inline-flex';
  } else if (existingFormProofPath && !removeExistingFormPhoto) {
    block.classList.add('has-photo');
    title.textContent = '✓ PHOTO JOINTE';
    sub.textContent = '';
    sub.style.display = 'none';
    pickBtn.innerHTML = `${CAM_SVG} REMPLACER`;
    clearBtn.style.display = 'inline-flex';
  } else {
    block.classList.remove('has-photo');
    thumb.removeAttribute('src');
    title.innerHTML = `${CAM_SVG} PHOTO DE PREUVE (OPTIONNEL)`;
    sub.textContent = '';
    sub.style.display = 'none';
    pickBtn.innerHTML = `${CAM_SVG} JOINDRE PHOTO`;
    clearBtn.style.display = 'none';
  }
}

function setFormPhotoFile(file, skipAiAutoScan = false) {
  if (!file) return;
  if (!/^image\//i.test(file.type) && !/\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name || '')) {
    showToast('Fichier non pris en charge : choisis une image.', { type: 'error' });
    return;
  }
  if (file.size > 40 * 1024 * 1024) {
    showToast('Image trop lourde (40 Mo max).', { type: 'error' });
    return;
  }
  if (formPhotoPreviewUrl) URL.revokeObjectURL(formPhotoPreviewUrl);
  formSelectedPhotoFile = file;
  formPhotoPreviewUrl = URL.createObjectURL(file);
  removeExistingFormPhoto = false;
  playToggleSound(true);
  updateFormPhotoUI();

  // D'une pierre deux coups : si une clé IA est configurée et que les heures sont vides, lire automatiquement la feuille
  if (!skipAiAutoScan && typeof getGeminiApiKey === 'function' && getGeminiApiKey()) {
    const startVal = document.getElementById('std-start')?.value;
    const endVal = document.getElementById('std-end')?.value;
    if (!startVal && !endVal && typeof analyzeSheetPhotoWithAI === 'function') {
      analyzeSheetPhotoWithAI(file);
    }
  }
}

function clearFormPhoto(silent = false) {
  if (formPhotoPreviewUrl) {
    URL.revokeObjectURL(formPhotoPreviewUrl);
    formPhotoPreviewUrl = null;
  }
  formSelectedPhotoFile = null;
  if (existingFormProofPath) {
    removeExistingFormPhoto = true;
  }
  const inp = document.getElementById('form-photo-input');
  if (inp) inp.value = '';
  if (!silent) playToggleSound(false);
  updateFormPhotoUI();
}

function initFormPhotoEvents() {
  const inp = document.getElementById('form-photo-input');
  const dropzone = document.getElementById('form-photo-dropzone');
  if (inp) {
    inp.addEventListener('change', () => {
      if (inp.files && inp.files[0]) setFormPhotoFile(inp.files[0]);
    });
  }
  if (dropzone) {
    ['dragenter', 'dragover'].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
      });
    });
    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) setFormPhotoFile(files[0]);
    });
  }
  window.addEventListener('paste', (e) => {
    if (document.body.getAttribute('data-view') === 'calendar') return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          setFormPhotoFile(file);
          showToast('Image collée depuis le presse-papiers !', { type: 'info', duration: 2200 });
          break;
        }
      }
    }
  });
}

// --- COMPRESSION & UPLOAD PHOTO SUPABASE STORAGE ---
function generatePhotoUid() {
  return (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function compressPhotoBlob(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e1) {
    try {
      bmp = await createImageBitmap(file);
    } catch (e2) {
      throw new Error("Format d'image non pris en charge par ce navigateur");
    }
  }
  async function encode(side, quality) {
    const ratio = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * ratio);
    canvas.height = Math.round(bmp.height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise(r => canvas.toBlob(r, 'image/webp', quality));
    if (!blob || blob.type !== 'image/webp') {
      blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    }
    return blob;
  }
  let blob = await encode(1280, 0.65);
  if (blob && blob.size > 250 * 1024) blob = await encode(1024, 0.5);
  if (bmp.close) bmp.close();
  if (!blob) throw new Error('Compression impossible');
  return blob;
}

async function uploadPhotoToSupabase(file) {
  const blob = await compressPhotoBlob(file);
  const newPath = generatePhotoUid() + (blob.type === 'image/webp' ? '.webp' : '.jpg');
  const { error } = await supabaseClient.storage
    .from(PHOTO_BUCKET)
    .upload(newPath, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return { path: newPath, sizeKB: Math.max(1, Math.round(blob.size / 1024)) };
}

// --- VISIONNEUSE, AJOUT 1-CLIC, REMPLACEMENT & SUPPRESSION (HISTORIQUE & AGENDA) ---
function initPhotoViewer() {
  const uploading = new Set();
  let pendingId = null;
  let viewing = null;
  let confirmDel = false;
  let confirmT;
  const LOADER = '<span class="px-loader" aria-hidden="true"><i></i><i></i><i></i></span>';
  const input = document.getElementById('photo-input');
  const dlg = document.getElementById('photo-dialog');
  const frame = document.getElementById('pd-frame');
  const btnRep = document.getElementById('pd-replace');
  const btnDel = document.getElementById('pd-delete');

  function find(id) {
    return cachedShifts.find(s => String(s.id) === String(id));
  }
  function storage() {
    return supabaseClient.storage.from(PHOTO_BUCKET);
  }
  function hint(m) {
    return /proof_path|bucket|polic|security|not found|404/i.test(m)
      ? "Installation Supabase incomplète (colonne, bucket ou policies) : vérifie le bucket 'proofs'. Détail : " + m
      : "Échec de l'envoi : " + m;
  }

  function lab(kind, busy) {
    if (busy) return LOADER + '<span>…</span>';
    if (kind === 'compact-view') return CAM_SVG + '<span>✓</span>';
    if (kind === 'compact-add') return CAM_SVG + '<span>+</span>';
    return CAM_SVG + '<span>' + (kind === 'badge' ? '✓ VOIR PHOTO' : '+ AJOUTER PHOTO') + '</span>';
  }

  function setBusy(id, on) {
    document.querySelectorAll('[data-photo-id="' + id + '"]').forEach(el => {
      el.disabled = on;
      if (on) el.setAttribute('aria-busy', 'true');
      else el.removeAttribute('aria-busy');
      el.innerHTML = lab(el.getAttribute('data-kind'), on);
    });
    if (viewing === String(id)) {
      btnRep.disabled = btnDel.disabled = on;
      btnRep.innerHTML = on ? LOADER + '<span>ENVOI…</span>' : 'REMPLACER';
    }
  }

  function pickFor(id) {
    if (uploading.has(String(id))) return;
    pendingId = id;
    input.value = '';
    input.click();
  }

  async function uploadForShift(id, file) {
    const item = find(id);
    const key = String(id);
    if (!item || uploading.has(key)) return;
    if (!/^image\//i.test(file.type) && !/\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name || '')) {
      showToast('Fichier non pris en charge : choisis une image.', { type: 'error' });
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      showToast('Image trop lourde (40 Mo max).', { type: 'error' });
      return;
    }
    uploading.add(key);
    setBusy(key, true);
    let ok = false;
    try {
      const upRes = await uploadPhotoToSupabase(file);
      const newPath = upRes.path;
      const oldPath = item.proof_path || null;
      const r = await supabaseClient.from('shifts').update({ proof_path: newPath, has_proof: true }).eq('id', item.id);
      if (r.error) {
        storage().remove([newPath]);
        throw r.error;
      }
      item.proof_path = newPath;
      item.has_proof = true;
      if (oldPath) storage().remove([oldPath]);
      ok = true;
      playSaveSuccessSound();
      showToast('Photo jointe ✓ (' + upRes.sizeKB + ' Ko)', { type: 'success' });
    } catch (err) {
      playErrorSound();
      showToast(hint(String((err && err.message) || 'erreur réseau')), {
        type: 'error',
        duration: 8000,
        actionText: 'RÉESSAYER',
        onAction: () => uploadForShift(id, file)
      });
    } finally {
      uploading.delete(key);
      setBusy(key, false);
      renderApp();
      if (ok) {
        const row = document.querySelector('.log-item[data-shift-id="' + key + '"]');
        if (row) row.classList.add('just-added-flash');
        if (viewing === key) openViewer(key);
      }
    }
  }

  async function removePhoto(id) {
    const it = find(id);
    const key = String(id);
    if (!it || !it.proof_path || uploading.has(key)) return;
    uploading.add(key);
    setBusy(key, true);
    try {
      const path = it.proof_path;
      const r = await supabaseClient.from('shifts').update({ proof_path: null, has_proof: false }).eq('id', it.id);
      if (r.error) throw r.error;
      storage().remove([path]);
      it.proof_path = null;
      it.has_proof = false;
      playDeleteSound();
      showToast('Photo supprimée — journée repassée « sans photo »', { type: 'warn', duration: 3500 });
      if (dlg.open) dlg.close();
    } catch (err) {
      playErrorSound();
      showToast('Erreur suppression photo : ' + ((err && err.message) || 'réseau'), { type: 'error' });
    } finally {
      uploading.delete(key);
      setBusy(key, false);
      renderApp();
    }
  }

  function msg(t) {
    frame.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'pd-msg';
    p.textContent = t;
    frame.appendChild(p);
  }

  function resetConfirm() {
    confirmDel = false;
    clearTimeout(confirmT);
    btnDel.textContent = 'SUPPRIMER LA PHOTO';
  }

  function openViewer(id) {
    const it = find(id);
    if (!it || !it.proof_path) return;
    viewing = String(id);
    resetConfirm();
    document.getElementById('pd-title').textContent = formatDateWithDayFR(it.date) + (it.note ? ' — ' + it.note : '');
    msg('CHARGEMENT…');
    btnRep.disabled = btnDel.disabled = uploading.has(viewing);
    if (!dlg.open) dlg.showModal();
    storage().createSignedUrl(it.proof_path, 3600).then(res => {
      if (viewing !== String(id) || !dlg.open) return;
      if (res.error || !res.data) {
        msg('Photo introuvable : ' + ((res.error && res.error.message) || 'erreur'));
        return;
      }
      const img = new Image();
      img.alt = 'Photo de preuve du ' + formatDateFR(it.date);
      img.onload = () => {
        frame.innerHTML = '';
        frame.appendChild(img);
      };
      img.onerror = () => {
        msg("Impossible d'afficher la photo.");
      };
      img.src = res.data.signedUrl;
    }).catch(e => {
      msg('Erreur réseau : ' + ((e && e.message) || ''));
    });
  }

  btnRep.addEventListener('click', () => {
    if (viewing) pickFor(viewing);
  });
  btnDel.addEventListener('click', () => {
    if (!viewing) return;
    if (!confirmDel) {
      confirmDel = true;
      btnDel.textContent = 'CONFIRMER ? RE-CLIQUE';
      confirmT = setTimeout(resetConfirm, 3500);
      return;
    }
    removePhoto(viewing);
  });
  document.getElementById('pd-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', () => {
    viewing = null;
    frame.innerHTML = '';
    resetConfirm();
  });

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-photo-act]');
    if (!el || el.disabled) return;
    const id = el.getAttribute('data-photo-id');
    if (el.getAttribute('data-photo-act') === 'add') pickFor(id);
    else openViewer(id);
  });

  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    const id = pendingId;
    pendingId = null;
    if (f && id != null) uploadForShift(id, f);
  });
}

