const { ipcRenderer } = require('electron');

window.addEventListener('message', (e) => {
  switch (e.data?.action) {
    case 'req.captureActiveWindow':
      ipcRenderer.invoke('captureActiveWindow').then((/** @type {Buffer} */ pngBuffer) => {
        if (!pngBuffer) {
          window.postMessage({ action: 'res.captureActiveWindow', error: 'failed to capture active window' }, '*');
          return;
        }
        window.postMessage({ action: 'res.captureActiveWindow', data: { buffer: pngBuffer } }, '*');
      }).catch(e => {
        window.postMessage({ action: 'res.captureActiveWindow', error: e.message }, '*');
      });
      break;
    default:
      console.log('unknown action:', e.data?.action);
  }
});

ipcRenderer.on('captureActiveWindow', (e, buffer) => {
  window.postMessage({ action: 'res.captureActiveWindow', data: { buffer } }, '*');
});

window.addEventListener('DOMContentLoaded', () => {
  const button = document.createElement('button');
  button.textContent = 'Capture Active Window';
  button.addEventListener('click', () => {
    window.postMessage({ action: 'req.captureActiveWindow' }, '*');
  });
  document.body.appendChild(button);

  window.addEventListener('message', (e) => {
    switch (e.data?.action) {
      case 'res.captureActiveWindow':
        if (e.data.error) {
          alert(e.data.error);
          return;
        }
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${Buffer.from(e.data.data.buffer).toString('base64')}`;
        document.body.appendChild(img);
        break;
    }
  });
});
