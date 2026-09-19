// Touch and mouse use the same camera gestures. A pinch never places an objective.
export function bindCameraControls(r) {
  const pointers = new Map();
  let drag = null,
    pinchDistance = 0,
    gesture = false;
  const canvas = r.canvas;
  canvas.style.touchAction = 'none';
  const distance = () => {
    const p = [...pointers.values()];
    return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  };
  const down = (e) => {
    if (e.button !== 0) return;
    canvas.focus();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture?.(e.pointerId);
    if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
      gesture = false;
    } else {
      gesture = true;
      pinchDistance = distance();
      if (drag) drag.moved = true;
    }
  };
  const move = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const next = distance();
      if (pinchDistance > 0 && next > 0) r.zoomBy(pinchDistance / next);
      pinchDistance = next;
      return;
    }
    if (!drag || gesture) return;
    const dx = e.clientX - drag.lastX,
      dy = e.clientY - drag.lastY;
    drag.moved ||= Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6;
    if (drag.moved) {
      if (['orbit', 'follow'].includes(r.view)) {
        r.azimuth -= dx * 0.005;
        r.elevation = Math.max(-0.15, Math.min(1.45, r.elevation + dy * 0.004));
      } else if (['ground', 'free', 'fpv', 'shoulder', 'mounted'].includes(r.view))
        r.directorCamera.look(dx, dy, ['fpv', 'shoulder', 'mounted'].includes(r.view));
    }
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  };
  const up = (e) => {
    if (!pointers.has(e.pointerId)) return;
    if (
      pointers.size === 1 &&
      drag &&
      !drag.moved &&
      !gesture &&
      ['orbit', 'top', 'front'].includes(r.view)
    ) {
      const rect = canvas.getBoundingClientRect();
      r.onObjective(r.worldPoint(e.clientX - rect.left, e.clientY - rect.top));
    }
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      drag = null;
      gesture = false;
    } else gesture = true;
  };
  const cancel = (e) => {
    pointers.delete(e.pointerId);
    gesture = true;
    if (!pointers.size) drag = null;
  };
  const wheel = (e) => {
    e.preventDefault();
    r.zoomBy(Math.exp(e.deltaY * 0.001));
  };
  const keydown = (e) => {
    const key = e.key.toLowerCase();
    if (
      ['ground', 'free'].includes(r.view) &&
      ['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(
        key,
      )
    ) {
      r.directorCamera.keys.add(key);
      e.preventDefault();
    } else if (key === '+' || key === '=') {
      r.zoomBy(0.8);
      e.preventDefault();
    } else if (key === '-') {
      r.zoomBy(1.25);
      e.preventDefault();
    }
  };
  const keyup = (e) => r.directorCamera.keys.delete(e.key.toLowerCase()),
    blur = () => {
      pointers.clear();
      drag = null;
      gesture = false;
      r.directorCamera.keys.clear();
    };
  const events = {
    pointerdown: down,
    pointermove: move,
    pointerup: up,
    pointercancel: cancel,
    lostpointercapture: cancel,
    wheel,
    keydown,
    keyup,
    blur,
  };
  for (const [key, fn] of Object.entries(events))
    canvas.addEventListener(key, fn, key === 'wheel' ? { passive: false } : undefined);
  return () => {
    for (const [key, fn] of Object.entries(events)) canvas.removeEventListener(key, fn);
  };
}
