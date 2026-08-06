import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, EmptyState, ErrorState, Loading, useNotification } from '../../../components/ui';
import { getApiErrorMessage, getApiErrorStatus } from '../../../lib/apiError';
import {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
} from '../../annotations/hooks/useAnnotations';
import type { Annotation } from '../../annotations/types';
import { PomodoroPeek } from '../../sessions/components/PomodoroPeek';
import { AnnotationPanel } from '../components/AnnotationPanel';
import { FocusControls } from '../components/FocusControls';
import { ReaderColors } from '../components/ReaderColors';
import { NoteTooltip } from '../components/NoteTooltip';
import { ReaderFrame } from '../components/ReaderFrame';
import type { ReaderFrameHandle, SelectionInfo } from '../components/ReaderFrame';
import { SelectionToolbar } from '../components/SelectionToolbar';
import type { ReaderMode } from '../readerStyles';
import { actionForKey } from '../shortcuts';
import { useThemeStore } from '../../../store/themeStore';
import {
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  useReaderPrefsStore,
} from '../store/readerPrefsStore';
import { useNoteCard } from '../hooks/useNoteCard';
import { useReaderSource, useReadingPosition } from '../hooks/useReaderSource';
import { useSaveProgress } from '../hooks/useSaveProgress';

/** Stable identity: `?? []` inline would repaint every highlight on every render. */
const NO_ANNOTATIONS: Annotation[] = [];

export const ReaderPage = () => {
  const { sourceId } = useParams();
  const id = Number(sourceId);
  const navigate = useNavigate();
  /**
   * Set when arriving from a citation embedded in a note. It outranks the
   * stored reading position: the user asked for a specific passage, not for
   * wherever they happened to stop last time.
   */
  const [searchParams] = useSearchParams();
  const citationAnchor = searchParams.get('anchor');
  const { notify } = useNotification();
  const frame = useRef<ReaderFrameHandle>(null);
  const shell = useRef<HTMLDivElement>(null);

  // Reading preferences outlive the page: they belong to the reader, not to
  // this mount. Kept as separate selectors so a font change does not re-render
  // through the panel's identity, or the other way round.
  const fontSize = useReaderPrefsStore((state) => state.fontSize);
  const adjustFontSize = useReaderPrefsStore((state) => state.adjustFontSize);
  const pageColor = useReaderPrefsStore((state) => state.pageColor);
  const textColor = useReaderPrefsStore((state) => state.textColor);
  const panelOpen = useReaderPrefsStore((state) => state.panelOpen);
  const setPanelOpen = useReaderPrefsStore((state) => state.setPanelOpen);
  const togglePanel = useReaderPrefsStore((state) => state.togglePanel);

  // Shared with the rest of the app: the frame and the chrome must agree.
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggle);
  const dark = theme === 'dark';
  const [mode, setMode] = useState<ReaderMode>('free');
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const noteCard = useNoteCard();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  /**
   * The pomodoro widget held open by hand.
   *
   * Hovering the top edge reveals it too — this is the state the pointer cannot
   * express: keeping it open while you read, or while you are somewhere else in
   * the page entirely.
   */
  const [pomodoroPinned, setPomodoroPinned] = useState(false);

  // Single source of truth for paging. The frame renders whatever it is told.
  const [focusPage, setFocusPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const { data, isPending, isError, error, refetch } = useReaderSource(id);
  // Separate from the payload above, which is cached for the life of the tab.
  // See useReadingPosition.
  const positionQuery = useReadingPosition(id);
  const annotationsQuery = useAnnotations(id);
  const createAnnotation = useCreateAnnotation(id);
  const deleteAnnotation = useDeleteAnnotation(id);
  const saveProgress = useSaveProgress(id);
  const annotations = annotationsQuery.data;

  const handleAnchorChange = useCallback(
    (anchor: string) => {
      /**
       * Opening a citation is a visit, not a reading session.
       *
       * The jump scrolls the frame, the frame reports the block it landed on,
       * and that used to be written straight into last_anchor — so checking a
       * quote you saved months ago silently threw away the page you were
       * actually on. A bookmark you did not ask to move must not move.
       */
      if (citationAnchor) return;
      saveProgress(anchor);
    },
    [citationAnchor, saveProgress],
  );

  const goToPage = useCallback(
    (page: number) => setFocusPage((current) => Math.min(Math.max(page, 1), totalPages || current)),
    [totalPages],
  );

  const handleNavigate = useCallback(
    (delta: number) => setFocusPage((current) => Math.min(Math.max(current + delta, 1), totalPages || current)),
    [totalPages],
  );

  // Memoised because the F shortcut depends on it, and an identity that changed
  // every render would re-attach the document's key listener just as often.
  const enterFocus = useCallback(async () => {
    // Start on the page being read, not back at the beginning.
    setFocusPage(frame.current?.currentPageFromReading() ?? 1);
    setMode('focus');
    setPanelOpen(false);
    try {
      // Called straight out of the click or the keypress: fullscreen needs a
      // user gesture, and the three setState calls above do not spend it.
      await shell.current?.requestFullscreen();
    } catch {
      // Fullscreen can be refused; focus mode still works inside the window.
    }
  }, [setPanelOpen]);

  const exitFocus = useCallback(async () => {
    setMode('free');
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Already leaving; nothing else to do.
      }
    }
  }, []);

  // Esc leaves fullscreen without telling React, so mode has to follow the
  // browser rather than the other way around.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setMode('free');
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Arrow keys work whether focus sits in the page or inside the frame.
  useEffect(() => {
    if (mode !== 'focus') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') handleNavigate(1);
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') handleNavigate(-1);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleNavigate, mode]);

  /** What a key means here. The frame reports them; `shortcuts.ts` decides. */
  const handleShortcut = useCallback(
    (pressed: string) => {
      const focusedNow = mode === 'focus';

      switch (actionForKey(pressed, focusedNow)) {
        case 'togglePomodoro':
          setPomodoroPinned((open) => !open);
          break;
        case 'toggleFocus':
          // A toggle, not a one-way door: Escape already leaves fullscreen, and
          // a key that only enters is a key you press twice wondering why.
          void (focusedNow ? exitFocus() : enterFocus());
          break;
        case 'toggleTheme':
          toggleTheme();
          break;
        case 'largerText':
          adjustFontSize(1);
          break;
        case 'smallerText':
          adjustFontSize(-1);
          break;
        case 'toggleNotes':
          togglePanel();
          break;
      }
    },
    [adjustFontSize, enterFocus, exitFocus, mode, toggleTheme, togglePanel],
  );

  // The same keys again, for when focus sits outside the frame — the header,
  // the annotation panel, or nowhere in particular after a click.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Typing "p" into a note is typing, not a shortcut. The frame's own
      // listener needs no such guard: that document is not editable.
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return;
      }
      handleShortcut(event.key);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleShortcut]);

  const dismissSelection = useCallback(() => {
    setSelection(null);
    frame.current?.clearSelection();
  }, []);

  const saveAnnotation = (annotationType: 'highlight' | 'note', content: string) => {
    if (!selection) return;
    createAnnotation.mutate(
      {
        source: id,
        annotation_type: annotationType,
        content,
        anchor: selection.ranges[0].anchor,
        page: selection.page,
        ranges: selection.ranges,
      },
      {
        onSuccess: dismissSelection,
        onError: (mutationError) =>
          notify({
            variant: 'error',
            title: 'Could not save',
            message: getApiErrorMessage(mutationError),
          }),
      },
    );
  };

  const handleDelete = (annotationId: number) => {
    setDeletingId(annotationId);
    deleteAnnotation.mutate(annotationId, {
      onSettled: () => setDeletingId(null),
      onError: (mutationError) =>
        notify({
          variant: 'error',
          title: 'Could not delete',
          message: getApiErrorMessage(mutationError),
        }),
    });
  };

  const handleSelectAnnotation = (annotation: Annotation) => {
    if (mode === 'focus') goToPage(annotation.page);
    frame.current?.scrollToAnchor(annotation.anchor);
  };

  // Both, not just the HTML: the frame scrolls to `initialAnchor` once, when it
  // loads, so rendering before the position arrives would resume from nowhere.
  if (isPending || positionQuery.isPending) return <Loading full label="Opening source" />;

  if (isError) {
    return (
      <div className="mx-auto max-w-measure px-6 py-12">
        {getApiErrorStatus(error) === 404 ? (
          <EmptyState
            title="Source not found"
            description="It may have been deleted, or it belongs to another account."
          />
        ) : (
          <ErrorState
            title="Could not open this source"
            message={getApiErrorMessage(error)}
            onRetry={() => refetch()}
          />
        )}
      </div>
    );
  }

  const focused = mode === 'focus';

  // Resolved against the live list, so a note deleted while shown cannot leave
  // a card behind. A passing selection hides it, a pinned card outranks one.
  const hoveredNote =
    noteCard.hover && (noteCard.pinned || !selection)
      ? (annotations ?? NO_ANNOTATIONS).find(
          (annotation) => annotation.id === noteCard.hover?.annotationId,
        )
      : undefined;

  return (
    <div ref={shell} className="flex h-dvh flex-col bg-page">
      {!focused && (
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="quiet" size="sm" onClick={() => navigate(-1)}>
              &larr; Back
            </Button>
            <h1 className="min-w-0 truncate font-heading text-sm text-muted">{data.title}</h1>
          </div>

          {/* Every control that has a key says so. A shortcut nobody is told
              about is a shortcut nobody uses, and the button is the only place
              the reader ever gets to mention it. */}
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <Button variant="quiet" size="sm" title="Focus mode (F)" onClick={enterFocus}>
              Focus
            </Button>
            <Button
              variant="quiet"
              size="sm"
              aria-label="Decrease text size"
              title="Smaller text (-)"
              disabled={fontSize <= MIN_FONT_SIZE}
              onClick={() => adjustFontSize(-1)}
            >
              A&minus;
            </Button>
            <Button
              variant="quiet"
              size="sm"
              aria-label="Increase text size"
              title="Larger text (+)"
              disabled={fontSize >= MAX_FONT_SIZE}
              onClick={() => adjustFontSize(1)}
            >
              A+
            </Button>
            <Button
              variant="quiet"
              size="sm"
              aria-pressed={dark}
              title="Switch theme (T)"
              onClick={toggleTheme}
            >
              {dark ? 'Light' : 'Dark'}
            </Button>
            <ReaderColors dark={dark} />
            <Button
              variant="quiet"
              size="sm"
              aria-pressed={panelOpen}
              title="Notes panel (N)"
              onClick={togglePanel}
            >
              Notes
            </Button>
          </div>
        </header>
      )}

      {/*
        Hangs off the top edge in BOTH modes, on purpose. In focus mode the
        header is gone and the page is nothing but the text — which is exactly
        where knowing how long is left matters, and exactly where leaving to
        find out costs the most.
      */}
      <PomodoroPeek
        studyspaceId={data.study_space}
        pinned={pomodoroPinned}
        onTogglePin={() => setPomodoroPinned((open) => !open)}
      />

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <ReaderFrame
            ref={frame}
            html={data.reader_html}
            title={data.title}
            initialAnchor={citationAnchor || positionQuery.data?.last_anchor || ''}
            fontSize={fontSize}
            dark={dark}
            pageColor={pageColor}
            textColor={textColor}
            mode={mode}
            focusPage={focusPage}
            annotations={annotations ?? NO_ANNOTATIONS}
            onAnchorChange={handleAnchorChange}
            onSelection={setSelection}
            onNoteHover={noteCard.onFrameHover}
            trackedNoteId={noteCard.hover?.annotationId ?? null}
            onNoteMove={noteCard.onFrameMove}
            onPagesCounted={setTotalPages}
            onNavigate={handleNavigate}
            onShortcut={handleShortcut}
          />
        </div>

        {!focused && panelOpen && (
          <AnnotationPanel
            annotations={annotations ?? NO_ANNOTATIONS}
            loading={annotationsQuery.isPending}
            onSelect={handleSelectAnnotation}
            onDelete={handleDelete}
            deletingId={deletingId}
          />
        )}
      </div>

      {focused && (
        <FocusControls
          page={focusPage}
          total={totalPages}
          onPrevious={() => handleNavigate(-1)}
          onNext={() => handleNavigate(1)}
          onExit={exitFocus}
        />
      )}

      {hoveredNote && noteCard.hover && (
        <NoteTooltip
          annotation={hoveredNote}
          hover={noteCard.hover}
          pinned={noteCard.pinned}
          onPointerEnter={noteCard.onCardEnter}
          onPointerLeave={noteCard.onCardLeave}
          onClick={noteCard.onCardClick}
        />
      )}

      {selection && (
        <SelectionToolbar
          key={`${selection.ranges[0].anchor}-${selection.ranges[0].start}`}
          selection={selection}
          saving={createAnnotation.isPending}
          onHighlight={() => saveAnnotation('highlight', selection.text)}
          onNote={(content) => saveAnnotation('note', content)}
          onDismiss={dismissSelection}
        />
      )}
    </div>
  );
};
