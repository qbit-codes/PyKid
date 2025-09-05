// src/lib/composables/usePanelResize.ts
// Panel resize logic composable for PyKid

import { writable, type Writable } from 'svelte/store';
import { onMount, onDestroy } from 'svelte';

export interface PanelSizes {
  leftPx: number;
  rowTopPx: number;
  videoPx: number;
}

export interface PanelConstraints {
  minLeft: number;
  maxLeft: number;
  minTopPx: number;
  minBotPx: number;
  maxTopPx: number;
  minVideoPx: number;
  maxVideoPx: number;
}

export function usePanelResize(editor?: any) {
  // Panel sizes
  const panelSizes: Writable<PanelSizes> = writable({
    leftPx: 380,
    rowTopPx: 0,
    videoPx: 180
  });

  // Panel constraints
  const constraints: Writable<PanelConstraints> = writable({
    minLeft: 260,
    maxLeft: 1200,
    minTopPx: 160,
    minBotPx: 140,
    maxTopPx: 0,
    minVideoPx: 120,
    maxVideoPx: 600
  });

  // Local storage keys
  const LS_LEFT = 'pysplit:leftPx';
  const LS_ROW = 'pysplit:rowTopPx';
  const LS_VIDEO = 'pysplit:videoPx';

  // Drag state
  let dragKind: 'col' | 'row' | null = null;
  let dragKindLeft: 'left-row' | null = null;

  // Element references (to be set by the component)
  let shellEl: HTMLDivElement;
  let pageEl: HTMLDivElement;
  let leftPaneEl: HTMLDivElement;

  // Set element references
  function setElements(shell: HTMLDivElement, page: HTMLDivElement, leftPane: HTMLDivElement) {
    shellEl = shell;
    pageEl = page;
    leftPaneEl = leftPane;
  }

  // Clamp functions
  function clampLeft() {
    if (!shellEl) return;
    const { width } = shellEl.getBoundingClientRect();
    
    constraints.update(c => ({
      ...c,
      minLeft: 260,
      maxLeft: Math.max(c.minLeft + 160, width - 360)
    }));

    panelSizes.update(sizes => {
      let currentConstraints = { minLeft: 260, maxLeft: 1200 };
      constraints.subscribe(c => currentConstraints = c)();
      const newLeftPx = Math.min(currentConstraints.maxLeft, Math.max(currentConstraints.minLeft, sizes.leftPx));
      localStorage.setItem(LS_LEFT, String(newLeftPx));
      return { ...sizes, leftPx: newLeftPx };
    });
  }

  function clampRows() {
    if (!pageEl) return;
    const { height } = pageEl.getBoundingClientRect();
    const minTopPx = 160;
    const minBotPx = 140;
    
    constraints.update(c => ({
      ...c,
      maxTopPx: height - minBotPx
    }));

    panelSizes.update(sizes => {
      const maxTopPx = height - minBotPx;
      let newRowTopPx = sizes.rowTopPx;
      
      if (newRowTopPx <= 0) {
        newRowTopPx = Math.max(minTopPx, height - 220);
      }
      newRowTopPx = Math.min(maxTopPx, Math.max(minTopPx, newRowTopPx));
      
      localStorage.setItem(LS_ROW, String(newRowTopPx));
      return { ...sizes, rowTopPx: newRowTopPx };
    });
  }

  function clampVideo() {
    if (!leftPaneEl) return;
    const { height } = leftPaneEl.getBoundingClientRect();
    const minChatPx = 240;
    const minVideoPx = 120;
    
    const maxVideoPx = Math.max(minVideoPx, height - 8 - minChatPx);
    
    constraints.update(c => ({
      ...c,
      maxVideoPx
    }));

    panelSizes.update(sizes => {
      const newVideoPx = Math.min(maxVideoPx, Math.max(minVideoPx, sizes.videoPx));
      localStorage.setItem(LS_VIDEO, String(newVideoPx));
      return { ...sizes, videoPx: newVideoPx };
    });
  }

  // Drag handlers
  function startColDrag(e: PointerEvent) {
    if (!shellEl) return;
    dragKind = 'col';
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-col');
  }

  function startRowDrag(e: PointerEvent) {
    if (!pageEl) return;
    dragKind = 'row';
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-row');
  }

  function startLeftRowDrag(e: PointerEvent) {
    if (!leftPaneEl) return;
    dragKindLeft = 'left-row';
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-row');
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragKind) return;
    if (dragKind === 'col' && shellEl) {
      const rect = shellEl.getBoundingClientRect();
      panelSizes.update(sizes => ({ ...sizes, leftPx: e.clientX - rect.left }));
      clampLeft();
    } else if (dragKind === 'row' && pageEl) {
      const rect = pageEl.getBoundingClientRect();
      panelSizes.update(sizes => ({ ...sizes, rowTopPx: e.clientY - rect.top }));
      clampRows();
      editor?.layout?.();
    }
  }

  function onPointerMoveLeft(e: PointerEvent) {
    if (dragKindLeft !== 'left-row' || !leftPaneEl) return;
    const rect = leftPaneEl.getBoundingClientRect();
    panelSizes.update(sizes => ({ ...sizes, videoPx: e.clientY - rect.top }));
    clampVideo();
  }

  function endDrag(e: PointerEvent) {
    if (!dragKind) return;
    dragKind = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    document.body.classList.remove('resizing-col');
    document.body.classList.remove('resizing-row');
    clampLeft();
    clampRows();
    editor?.layout?.();
  }

  function endLeftDrag(e: PointerEvent) {
    if (!dragKindLeft) return;
    dragKindLeft = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    document.body.classList.remove('resizing-row');
    clampVideo();
  }

  // Reset functions
  function resetCols() {
    if (!shellEl) return;
    const { width } = shellEl.getBoundingClientRect();
    const minLeft = 260;
    panelSizes.update(sizes => ({
      ...sizes,
      leftPx: Math.max(minLeft, Math.min(width - 360, Math.round(width * 0.30)))
    }));
    clampLeft();
    editor?.layout?.();
  }

  function resetRows() {
    if (!pageEl) return;
    const { height } = pageEl.getBoundingClientRect();
    const minTopPx = 160;
    const minBotPx = 140;
    panelSizes.update(sizes => ({
      ...sizes,
      rowTopPx: Math.max(minTopPx, Math.min(height - minBotPx, height - 220))
    }));
    clampRows();
    editor?.layout?.();
  }

  function resetVideo() {
    panelSizes.update(sizes => ({ ...sizes, videoPx: 180 }));
    clampVideo();
  }

  // Initialize from localStorage
  function initialize() {
    const savedLeft = Number(localStorage.getItem(LS_LEFT));
    if (!Number.isNaN(savedLeft) && savedLeft > 0) {
      panelSizes.update(sizes => ({ ...sizes, leftPx: savedLeft }));
    }

    const savedRow = Number(localStorage.getItem(LS_ROW));
    if (!Number.isNaN(savedRow) && savedRow > 0) {
      panelSizes.update(sizes => ({ ...sizes, rowTopPx: savedRow }));
    }

    const savedVideo = Number(localStorage.getItem(LS_VIDEO));
    if (!Number.isNaN(savedVideo) && savedVideo > 0) {
      panelSizes.update(sizes => ({ ...sizes, videoPx: savedVideo }));
    }

    requestAnimationFrame(() => {
      clampLeft();
      clampRows();
      clampVideo();
    });
  }

  // Keyboard handlers
  function handleColKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { 
      e.preventDefault(); 
      resetCols(); 
    }
    if (e.key === 'ArrowLeft') { 
      panelSizes.update(sizes => ({ ...sizes, leftPx: sizes.leftPx - 16 }));
      clampLeft(); 
      editor?.layout?.(); 
    }
    if (e.key === 'ArrowRight') { 
      panelSizes.update(sizes => ({ ...sizes, leftPx: sizes.leftPx + 16 }));
      clampLeft(); 
      editor?.layout?.(); 
    }
  }

  function handleRowKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { 
      e.preventDefault(); 
      resetRows(); 
    }
    if (e.key === 'ArrowUp') { 
      panelSizes.update(sizes => ({ ...sizes, rowTopPx: sizes.rowTopPx - 16 }));
      clampRows(); 
      editor?.layout?.(); 
    }
    if (e.key === 'ArrowDown') { 
      panelSizes.update(sizes => ({ ...sizes, rowTopPx: sizes.rowTopPx + 16 }));
      clampRows(); 
      editor?.layout?.(); 
    }
  }

  function handleVideoKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { 
      e.preventDefault(); 
      resetVideo(); 
    }
    if (e.key === 'ArrowUp') { 
      panelSizes.update(sizes => ({ ...sizes, videoPx: sizes.videoPx - 16 }));
      clampVideo(); 
    }
    if (e.key === 'ArrowDown') { 
      panelSizes.update(sizes => ({ ...sizes, videoPx: sizes.videoPx + 16 }));
      clampVideo(); 
    }
  }

  return {
    // Stores
    panelSizes,
    constraints,

    // Setup
    setElements,
    initialize,

    // Drag handlers
    startColDrag,
    startRowDrag,
    startLeftRowDrag,
    onPointerMove,
    onPointerMoveLeft,
    endDrag,
    endLeftDrag,

    // Reset functions
    resetCols,
    resetRows,
    resetVideo,

    // Keyboard handlers
    handleColKeydown,
    handleRowKeydown,
    handleVideoKeydown,

    // Clamping functions
    clampLeft,
    clampRows,
    clampVideo
  };
}