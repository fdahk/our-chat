// Agent 任务 tab(对话式)。提交任务 → 用户气泡 + 助手气泡(思考过程 tool_called/tool_result
// + final_answer 答案)。事件经 SSE 实时追加;思考过程默认展开,得出答案后折叠。
import { useEffect, useRef, useState } from 'react';
import ChatComposer from '@/globalComponents/chatComposer';
import { useToast } from '@/globalComponents/toast';
import { useLang } from '@/i18n';
import { streamRun, submitAgentTask } from '../../api';
import type { RunEvent } from '../../type';
import styles from './style.module.scss';

interface UserItem { kind: 'user'; id: string; text: string }
interface AssistantItem { kind: 'assistant'; id: string; runId: string; events: RunEvent[]; done: boolean }
type ChatItem = UserItem | AssistantItem;

const TERMINAL: RunEvent['type'][] = ['run_completed', 'run_failed', 'final_answer'];

function TasksTab() {
  const { t } = useLang();
  const toast = useToast();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const closersRef = useRef<Record<string, () => void>>({});
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // 卸载时关闭所有 SSE
  useEffect(() => () => {
    Object.values(closersRef.current).forEach((close) => close());
  }, []);

  // 新内容来 → 滚到底
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [items]);

  const submit = async (text: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { runId } = await submitAgentTask(text);
      setItems((xs) => [
        ...xs,
        { kind: 'user', id: `u-${runId}`, text },
        { kind: 'assistant', id: `a-${runId}`, runId, events: [], done: false },
      ]);

      const close = streamRun(
        runId,
        (evt) => {
          setItems((xs) =>
            xs.map((it) =>
              it.kind === 'assistant' && it.runId === runId
                ? { ...it, events: [...it.events, evt], done: it.done || TERMINAL.includes(evt.type) }
                : it,
            ),
          );
        },
        () => {
          setItems((xs) =>
            xs.map((it) => (it.kind === 'assistant' && it.runId === runId ? { ...it, done: true } : it)),
          );
          closersRef.current[runId]?.();
          delete closersRef.current[runId];
        },
      );
      closersRef.current[runId] = close;
    } catch (e) {
      toast.err(`${t('agent.tasks.submitFail')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.body} ref={bodyRef}>
        {items.length === 0 && <div className={styles.placeholder}>{t('agent.tasks.empty')}</div>}
        {items.map((it) =>
          it.kind === 'user' ? (
            <div key={it.id} className={`${styles.msgRow} ${styles.msgRowSelf}`}>
              <div className={styles.userBubble}>{it.text}</div>
            </div>
          ) : (
            <AssistantBubble key={it.id} item={it} />
          ),
        )}
      </div>

      <ChatComposer
        onSend={submit}
        placeholder={t('agent.tasks.placeholder')}
        sending={submitting}
        sendLabel={t('agent.tasks.submit')}
      />
    </div>
  );
}

function AssistantBubble({ item }: { item: AssistantItem }) {
  const { t } = useLang();
  const steps = item.events.filter((e) => e.type === 'tool_called' || e.type === 'tool_result');
  const finalEvt = item.events.find((e) => e.type === 'final_answer');
  const failed = item.events.some((e) => e.type === 'run_failed');
  // SSE 的 data 是整条 run_event 行,真正的字段在 data.payload 下
  const finalPayload = (finalEvt?.data?.payload ?? {}) as Record<string, unknown>;
  const answer = typeof finalPayload.content === 'string' ? finalPayload.content : '';
  const toolCount = item.events.filter((e) => e.type === 'tool_called').length;

  return (
    <div className={styles.msgRow}>
      <div className={styles.bubble}>
        {steps.length > 0 && (
          <details className={styles.think} open={!item.done}>
            <summary className={styles.thinkSummary}>
              {t('agent.tasks.thinkProcess')} · {t('agent.tasks.steps', { count: toolCount })}
            </summary>
            <div className={styles.trace}>
              {steps.map((e, i) => <StepRow key={`${e.id}-${i}`} evt={e} />)}
            </div>
          </details>
        )}
        {answer ? (
          <div className={styles.answer}>{answer}</div>
        ) : failed ? (
          <div className={styles.err}>{t('agent.tasks.failed')}</div>
        ) : !item.done ? (
          <div className={styles.thinking}>{t('agent.tasks.thinking')}</div>
        ) : null}
      </div>
    </div>
  );
}

function StepRow({ evt }: { evt: RunEvent }) {
  // SSE 的 data 是整条 run_event 行,真正的字段在 data.payload 下
  const payload = (evt.data?.payload ?? {}) as Record<string, unknown>;
  if (evt.type === 'tool_called') {
    const name = String(payload.name ?? '');
    const argsObj = (payload.args ?? {}) as Record<string, unknown>;
    const args = Object.keys(argsObj).length > 0 ? JSON.stringify(argsObj) : '';
    return (
      <div className={styles.step}>
        <span className={styles.stepTool}>🔧 {name}</span>
        {args && <span className={styles.stepArgs}>{args}</span>}
      </div>
    );
  }
  const result = String(payload.result ?? '');
  return (
    <div className={styles.step}>
      <span className={styles.stepResultLabel}>↳</span>
      <pre className={styles.stepResult}>{result}</pre>
    </div>
  );
}

export default TasksTab;
