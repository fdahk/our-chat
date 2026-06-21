// DocumentsTab 组件测试。覆盖:
//   - empty 态:无数据显示提示文案
//   - list 态:列表项 + 文件名 + 大小 + 分片数 + 状态标签
//   - 刷新按钮触发 listDocuments
//   - 删除按钮触发 confirm 后调 deleteDocument 并从 UI 移除

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '@/test/render';

vi.mock('../../api', () => ({
  listDocuments:  vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

import DocumentsTab from './index';
import { deleteDocument, listDocuments } from '../../api';
import type { AgentDocument } from '../../type';
import { documentReadyFixture } from '../../__fixtures__/agentServer';

const mockList   = vi.mocked(listDocuments);
const mockDelete = vi.mocked(deleteDocument);

const docFixture = (over: Partial<AgentDocument> = {}): AgentDocument => ({
  ...documentReadyFixture,
  ...over,
});

beforeEach(() => {
  mockList.mockReset();
  mockDelete.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe('<DocumentsTab>', () => {
  it('empty 态显示提示文案', async () => {
    mockList.mockResolvedValue([]);
    renderWithProviders(<DocumentsTab />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(await screen.findByText(/还没有文档/)).toBeInTheDocument();
  });

  it('list 态渲染文件名 + 分片数 + 状态标签', async () => {
    mockList.mockResolvedValue([
      docFixture({ id: 1, filename: 'a.pdf', chunkCount: 3, status: 'ready' }),
      docFixture({ id: 2, filename: 'b.md',  chunkCount: 0, status: 'parsing' }),
    ]);
    renderWithProviders(<DocumentsTab />);

    expect(await screen.findByText('a.pdf')).toBeInTheDocument();
    expect(await screen.findByText('b.md')).toBeInTheDocument();
    expect(screen.getByText('3 片')).toBeInTheDocument();
    expect(screen.getByText('0 片')).toBeInTheDocument();
    // 状态徽章用原始 status 字符串
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('parsing')).toBeInTheDocument();
  });

  it('刷新按钮再调一次 listDocuments', async () => {
    mockList.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<DocumentsTab />);
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: '刷新' }));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it('删除按钮:confirm 后调 deleteDocument 并从 UI 移除', async () => {
    mockList.mockResolvedValue([docFixture({ id: 7, filename: 'to-delete.pdf' })]);
    mockDelete.mockResolvedValue(undefined);
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    const user = userEvent.setup();
    renderWithProviders(<DocumentsTab />);

    expect(await screen.findByText('to-delete.pdf')).toBeInTheDocument();

    // 列表项里有 aria-label="delete" 的按钮
    await user.click(screen.getByRole('button', { name: /delete/ }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.queryByText('to-delete.pdf')).not.toBeInTheDocument());
  });

  it('confirm 拒绝时不调 deleteDocument', async () => {
    mockList.mockResolvedValue([docFixture()]);
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

    const user = userEvent.setup();
    renderWithProviders(<DocumentsTab />);
    await screen.findByText('spec.pdf');

    await user.click(screen.getByRole('button', { name: /delete/ }));
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
