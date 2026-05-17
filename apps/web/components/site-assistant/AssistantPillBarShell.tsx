'use client'

import {
  type FormEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useState,
} from 'react'
import { ChevronDown, ChevronUp, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AssistantPillMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  tone?: 'normal' | 'error'
}

export function AssistantPillBarShell({
  ariaLabel,
  shellRef,
  title,
  status,
  statusTone = 'normal',
  closing,
  applying,
  compact = false,
  widthClassName = 'w-[min(816px,calc(100vw-1.5rem))] sm:w-[min(816px,calc(100vw-2rem))]',
  messages,
  listRef,
  inputRef,
  inputValue,
  placeholder,
  inputDisabled,
  sendDisabled,
  sendLabel = 'Send',
  sendingLabel = 'Thinking',
  isSending,
  error,
  leftActions,
  rightActions,
  attachments,
  preview,
  debug,
  activity,
  renderMessageExtras,
  onInputChange,
  onSubmit,
  onInputKeyDown,
  onInputDragOver,
  onInputDrop,
  onActivate,
}: {
  ariaLabel: string
  shellRef?: RefObject<HTMLElement | null>
  title: string
  status: string
  statusTone?: 'normal' | 'error' | 'preview'
  closing?: boolean
  applying?: boolean
  compact?: boolean
  widthClassName?: string
  messages: AssistantPillMessage[]
  listRef?: RefObject<HTMLDivElement | null>
  inputRef?: RefObject<HTMLInputElement | null>
  inputValue: string
  placeholder: string
  inputDisabled?: boolean
  sendDisabled?: boolean
  sendLabel?: string
  sendingLabel?: string
  isSending?: boolean
  error?: string | null
  leftActions?: ReactNode
  rightActions?: ReactNode
  attachments?: ReactNode
  preview?: ReactNode
  debug?: ReactNode
  activity?: ReactNode
  renderMessageExtras?: (message: AssistantPillMessage) => ReactNode
  onInputChange: (value: string) => void
  onSubmit: () => void
  onInputKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  onInputDragOver?: (event: DragEvent<HTMLInputElement>) => void
  onInputDrop?: (event: DragEvent<HTMLInputElement>) => void
  onActivate?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasShelfContent = messages.length > 0 || Boolean(activity) || Boolean(preview) || Boolean(debug) || Boolean(error) || Boolean(attachments)

  useEffect(() => {
    if (Boolean(activity) || Boolean(preview) || Boolean(debug) || Boolean(error) || Boolean(attachments)) {
      setExpanded(true)
    }
  }, [activity, attachments, debug, error, preview])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (compact) {
      onActivate?.()
      return
    }
    onSubmit()
  }

  function handleCompactActivate() {
    if (compact) onActivate?.()
  }

  return (
    <>
      <style jsx global>{`
        @keyframes assistant-pill-shell-in {
          0% { opacity: 0; transform: translate(-50%, 14px) scale(0.985); }
          100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
        @keyframes assistant-pill-shell-out {
          0% {
            opacity: 1;
            transform: translate(-50%, 0) scaleX(1) scaleY(1);
            transform-origin: bottom center;
          }
          100% {
            opacity: 0;
            transform: translate(-50%, calc(1rem + 9px)) scaleX(0.6) scaleY(0.42);
            transform-origin: bottom center;
          }
        }
        @keyframes assistant-pill-apply {
          0% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          100% { opacity: 0; transform: translate(-50%, 10px) scale(0.985); }
        }
        @property --assistant-pill-angle {
          syntax: '<angle>';
          inherits: false;
          initial-value: 0deg;
        }
        @keyframes assistant-pill-loading-glow {
          to { --assistant-pill-angle: 360deg; }
        }
        .assistant-pill-glint {
          box-shadow: 0 30px 82px rgba(83,49,28,0.2), 0 12px 32px rgba(83,49,28,0.12);
        }
        .assistant-pill-loading {
          border-color: transparent !important;
          background:
            linear-gradient(#fff8f1, #fff8f1) padding-box,
            conic-gradient(
              from var(--assistant-pill-angle, 0deg),
              transparent 0deg,
              transparent 232deg,
              rgba(205, 104, 44, 0.46) 276deg,
              rgba(205, 104, 44, 1) 306deg,
              rgba(188, 224, 203, 0.98) 322deg,
              rgba(205, 104, 44, 0.42) 346deg,
              transparent 360deg
            ) border-box;
          animation: assistant-pill-loading-glow 5.5s linear infinite;
          box-shadow: 0 30px 82px rgba(83,49,28,0.2), 0 12px 32px rgba(83,49,28,0.12), 0 0 34px rgba(47,107,79,0.28);
        }
      `}</style>
      <section
        ref={shellRef}
        className={cn(
          'fixed left-1/2 z-50 -translate-x-1/2 transition-[width,bottom,opacity,transform] duration-300 ease-out',
          compact ? 'bottom-3 w-[min(420px,calc(100vw-1.5rem))]' : 'bottom-7 max-sm:bottom-5',
          !compact && widthClassName,
          closing && !compact && 'pointer-events-none opacity-0 scale-[0.98]',
          applying && 'pointer-events-none opacity-0 scale-[0.985]',
        )}
        aria-label={ariaLabel}
      >
        <div className="relative flex justify-center">
          <div
            className={cn(
              'absolute bottom-[calc(100%-1px)] z-0 w-[78%] origin-bottom overflow-hidden rounded-t-[18px] rounded-b-none border border-b-0 transition-[clip-path,transform,width] duration-300 ease-out max-sm:w-[90%]',
              hasShelfContent ? 'shadow-[0_-18px_45px_rgba(83,49,28,0.08)]' : '',
              compact && 'pointer-events-none',
            )}
            style={{
              background: '#fff4ea',
              borderColor: '#e8cdb7',
              clipPath: compact ? 'inset(100% 0 0 0 round 18px 18px 0 0)' : 'inset(0 0 0 0 round 18px 18px 0 0)',
              transform: compact ? 'translateY(calc(100% + 1px)) scaleY(0.75)' : 'translateY(0) scaleY(1)',
            }}
          >
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left transition hover:bg-[#ffead8]/70"
              aria-expanded={expanded}
              title={title}
            >
              <span
                className={cn('h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_2px_rgba(47,107,79,0.14)]', isSending ? 'animate-pulse' : '')}
                style={{ background: statusTone === 'error' ? '#a85c2a' : statusTone === 'preview' ? '#d99a2b' : '#cd682c' }}
              />
              <span className="min-w-0 flex-1 truncate text-sm leading-tight" style={{ color: statusTone === 'error' ? '#a85c2a' : '#725a48' }}>
                {status}
              </span>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition hover:bg-white/70" style={{ color: '#725a48' }}>
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </span>
            </button>

            <div
              className="overflow-hidden transition-[max-height,opacity] duration-300 ease-out"
              style={{ maxHeight: expanded ? 'min(56vh, 460px)' : '0px', opacity: expanded ? 1 : 0 }}
            >
              <div ref={listRef} className="max-h-[min(56vh,460px)] space-y-3 overflow-y-auto px-4 pb-4 pt-1">
                {activity}
                {messages.map((message) => (
                  <div key={message.id}>
                    <div className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                      <div
                        className="max-w-[88%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm"
                        style={{
                          background: message.role === 'user' ? '#cd682c' : message.tone === 'error' ? '#fff1e8' : '#fffefd',
                          border: message.role === 'assistant' ? '1px solid #f0e5db' : '1px solid #cd682c',
                          color: message.role === 'user' ? '#ffffff' : message.tone === 'error' ? '#a85c2a' : '#4b3324',
                        }}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </div>
                    {renderMessageExtras?.(message)}
                  </div>
                ))}
                {preview}
                {debug}
                {attachments}
                {error && (
                  <div className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: '#fff1e8', color: '#a85c2a', border: '1px solid #f0cdb8' }}>
                    {error}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          onClick={handleCompactActivate}
          className={cn(
            'relative z-10 flex items-center gap-2 overflow-visible rounded-full border bg-[#fff8f1] shadow-[0_24px_70px_rgba(83,49,28,0.16)] transition-[min-height,padding,box-shadow,border-color] duration-300',
            compact
              ? 'min-h-10 cursor-text px-2 py-1.5 shadow-[0_14px_38px_rgba(83,49,28,0.12)] hover:border-[#cd682c]/55 hover:shadow-[0_18px_46px_rgba(83,49,28,0.16)]'
              : cn('assistant-pill-glint min-h-[64px] px-3.5 py-3', isSending && 'assistant-pill-loading'),
          )}
          style={{ border: !compact && isSending ? '1.25px solid transparent' : '1px solid #e8cdb7' }}
        >
            {!compact && leftActions}
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              onFocus={handleCompactActivate}
              readOnly={compact}
              className={cn('relative z-10 min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#a58a74]', compact ? 'py-0.5 pl-1 text-[12px]' : 'py-2 text-sm')}
              style={{ color: '#4b3324' }}
              placeholder={placeholder}
              disabled={!compact && inputDisabled}
              onKeyDown={onInputKeyDown}
              onDragOver={onInputDragOver}
              onDrop={onInputDrop}
            />
            {!compact && rightActions}
            <button
              type={compact ? 'button' : 'submit'}
              onClick={compact ? handleCompactActivate : undefined}
              disabled={!compact && sendDisabled}
              className={cn(
                'relative z-10 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-white transition hover:bg-[#b85825] disabled:opacity-50',
                compact ? 'h-8 w-8 px-0' : 'h-10 px-3.5 max-[420px]:w-10 max-[420px]:px-0',
              )}
              style={{ background: '#cd682c' }}
              aria-label={isSending ? sendingLabel : sendLabel}
              title={isSending ? sendingLabel : sendLabel}
            >
              <Send className="h-3.5 w-3.5" />
              <span className={compact ? 'sr-only' : 'max-[420px]:sr-only'}>{isSending ? sendingLabel : sendLabel}</span>
            </button>
        </form>
      </section>
    </>
  )
}
