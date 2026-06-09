// 文档库 tab。列表轮询 + 文件上传(multipart)。
//
// 上传后 agent-server 返回 { documentId, runId },走 BullMQ 异步 parse/chunk/embed,
// 这里用 5 秒 polling 拉列表刷状态(简单粗暴,够 MVP)。后续可以接 /runs/:runId/stream
// 看 ingestion 事件流,精度更高。
import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@/globalComponents/button';
import { useToast } from '@/globalComponents/toast';
import { useLang } from '@/i18n';
import { deleteDocument, listDocuments, uploadDocument } from '../../api';
import type { AgentDocument, DocStatus } from '../../type';
import styles from './style.module.scss';

const TERMINAL: DocStatus[] = ['ready', 'failed'];

function DocumentsTab() {
  const { t } = useLang();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [docs, setDocs] = useState<AgentDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listDocuments();
      setDocs(list);
    } catch (e) {
      toast.err(`${t('agent.docs.loadFail')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  // 首次加载
  useEffect(() => { void refresh(); }, [refresh]);

  // 如果还有未完成的文档,5 秒轮询一次
  useEffect(() => {
    const pending = docs.some((d) => !TERMINAL.includes(d.status));
    if (!pending) return;
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [docs, refresh]);

  const onPick = () => fileRef.current?.click();

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      await uploadDocument(file);
      toast.ok(t('agent.docs.uploadOk'));
      await refresh();
    } catch (e) {
      toast.err(`${t('agent.docs.uploadFail')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onDelete = async (id: number) => {
    if (!confirm(t('agent.docs.confirmDelete'))) return;
    try {
      await deleteDocument(id);
      setDocs((xs) => xs.filter((d) => d.id !== id));
    } catch (e) {
      toast.err(`${t('agent.docs.deleteFail')}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h3 className={styles.title}>{t('agent.docs.title')}</h3>
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} loading={loading}>
            {t('agent.docs.refresh')}
          </Button>
          <Button variant="primary" size="sm" onClick={onPick} loading={uploading}>
            {t('agent.docs.upload')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
          />
        </div>
      </header>

      {docs.length === 0
        ? <div className={styles.empty}>{t('agent.docs.empty')}</div>
        : (
          <ul className={styles.list}>
            {docs.map((d) => (
              <li key={d.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <div className={styles.itemName} title={d.filename}>{d.filename}</div>
                  <div className={styles.itemMeta}>
                    <span>{formatSize(d.sizeBytes)}</span>
                    <span className={styles.metaSep}>·</span>
                    <span>{t('agent.docs.chunks', { count: d.chunkCount })}</span>
                    <span className={styles.metaSep}>·</span>
                    <span>{new Date(d.createdAt).toLocaleString()}</span>
                  </div>
                  {d.errorMsg && <div className={styles.itemErr}>{d.errorMsg}</div>}
                </div>
                <StatusBadge status={d.status} />
                <button
                  type="button"
                  className={styles.delBtn}
                  onClick={() => void onDelete(d.id)}
                  aria-label="delete"
                >
                  <i className="iconfont icon-close" />
                </button>
              </li>
            ))}
          </ul>
        )
      }
    </div>
  );
}

function StatusBadge({ status }: { status: DocStatus }) {
  const tone = status === 'ready' ? 'ok' : status === 'failed' ? 'err' : 'pending';
  return <span className={`${styles.badge} ${styles[`badge-${tone}` as const]}`}>{status}</span>;
}

function formatSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export default DocumentsTab;
