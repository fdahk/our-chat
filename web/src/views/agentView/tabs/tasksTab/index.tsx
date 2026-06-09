// Agent 任务 tab。提交任务 → 拿 runId → 订阅 SSE 看 tool_called/tool_result/final_answer。
//
// agent-server 的 agent runner 一个任务最多跑 8 轮工具调用,每一步推一个 RunEvent。
// 这里把事件按时间线展示,final_answer 高亮。
import { useEffect, useRef, useState } from 'react';
import Button from '@/globalComponents/button';
import { useToast } from '@/globalComponents/toast';
import { useLang } from '@/i18n';
import { streamRun, submitAgentTask } from '../../api';
import type { RunEvent } from '../../type';
import styles from './style.module.scss';

interface RunSession {
  runId: string;
  task: string;
  events: RunEvent[];
  done: boolean;
}

function TasksTab() {
  const { t } = useLang();
  const toast = useToast();
  const [task, setTask] = useState('');
  const [sessions, setSessions] = useState<RunSession[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const closersRef = useRef<Record<string, () => void>>({});
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // 卸载时关闭所有 SSE
  useEffect(() => () => {
    Object.values(closersRef.current).forEach((close) => close());
  }, []);

  // 新事件来 → 滚到底
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [sessions]);

  const submit = async () => {
    const text = task.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const { runId } = await submitAgentTask(text);
      const session: RunSession = { runId, task: text, events: [], done: false };
      setSessions((xs) => [...xs, session]);
      setTask('');

      const close = streamRun(runId, (evt) => {
        setSessions((xs) =>
          xs.map((s) => {
            if (s.runId !== runId) return s;
            const done = ['run_completed', 'run_failed', 'final_answer'].includes(evt.type);
            return { ...s, events: [...s.events, evt], done: s.done || done };
          }),
        );
      }, () => {
        // SSE error 时直接标 done,关连接
        setSessions((xs) => xs.map((s) => (s.runId === runId ? { ...s, done: true } : s)));
        closersRef.current[runId]?.();
        delete closersRef.current[runId];
      });
      closersRef.current[runId] = close;
    } catch (e) {
      toast.err(`${t('agent.tasks.submitFail')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.composer}>
        <textarea
          className={styles.input}
          rows={3}
          placeholder={t('agent.tasks.placeholder')}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={submitting}
        />
        <Button variant="primary" size="md" onClick={() => void submit()} loading={submitting}>
          {t('agent.tasks.submit')}
        </Button>
      </div>

      <div className={styles.hint}>{t('agent.tasks.hint')}</div>

      <div className={styles.timeline} ref={timelineRef}>
        {sessions.length === 0 && (
          <div className={styles.empty}>{t('agent.tasks.empty')}</div>
        )}
        {sessions.map((s) => (
          <article key={s.runId} className={styles.session}>
            <header className={styles.sessionHead}>
              <span className={`${styles.dot} ${s.done ? styles.dotDone : styles.dotLive}`} />
              <span className={styles.sessionTask}>{s.task}</span>
              <code className={styles.sessionId}>{s.runId.slice(0, 8)}</code>
            </header>
            <ol className={styles.events}>
              {s.events.map((e) => <EventRow key={`${s.runId}-${e.id}`} evt={e} />)}
            </ol>
          </article>
        ))}
      </div>
    </div>
  );
}

function EventRow({ evt }: { evt: RunEvent }) {
  const klass = `${styles.evt} ${styles[`evt-${evt.type}` as const] ?? ''}`;
  return (
    <li className={klass}>
      <code className={styles.evtType}>{evt.type}</code>
      <pre className={styles.evtPayload}>{stringifyPayload(evt.data)}</pre>
    </li>
  );
}

function stringifyPayload(data: Record<string, unknown>): string {
  try {
    const compact = JSON.stringify(data, null, 2);
    return compact.length > 600 ? `${compact.slice(0, 600)}…` : compact;
  } catch { return String(data); }
}

export default TasksTab;
