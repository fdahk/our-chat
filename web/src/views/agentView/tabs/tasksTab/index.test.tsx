// TasksTab 测试(对话式)。覆盖:empty 态 / 提交(用户气泡 + 订阅)/ 思考过程与答案渲染。
//
// streamRun 是 EventSource 包装,这里直接 mock 它的回调,在测试里手动 push 事件。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor, act } from '@/test/render';
import type { RunEvent } from '../../type';

vi.mock('../../api', () => ({
  submitAgentTask: vi.fn(),
  streamRun:       vi.fn(),
}));

import TasksTab from './index';
import { streamRun, submitAgentTask } from '../../api';
import { agentTaskRespFixture, runEventFixtures } from '../../__fixtures__/agentServer';

const mSubmit = vi.mocked(submitAgentTask);
const mStream = vi.mocked(streamRun);

beforeEach(() => { mSubmit.mockReset(); mStream.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe('<TasksTab>', () => {
  it('初次渲染 empty', () => {
    renderWithProviders(<TasksTab />);
    expect(screen.getByText(/提交一个任务/)).toBeInTheDocument();
  });

  it('提交任务 → 调 submitAgentTask + 订阅 streamRun + 显示用户气泡', async () => {
    const user = userEvent.setup();
    mSubmit.mockResolvedValue(agentTaskRespFixture);
    mStream.mockReturnValue(() => undefined);

    renderWithProviders(<TasksTab />);
    await user.type(screen.getByPlaceholderText(/描述一个任务/), 'summarize my docs');
    await user.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(mSubmit).toHaveBeenCalledWith('summarize my docs'));
    expect(mStream).toHaveBeenCalledWith(
      agentTaskRespFixture.runId, expect.any(Function), expect.any(Function),
    );

    // 用户输入的任务文本作为气泡显示在页面上
    expect(await screen.findByText('summarize my docs')).toBeInTheDocument();
  });

  it('streamRun 推事件 → 渲染思考过程(工具/结果)与最终答案', async () => {
    const user = userEvent.setup();
    mSubmit.mockResolvedValue({ runId: 'r1' });
    let pushed: ((e: RunEvent) => void) | null = null;
    mStream.mockImplementation((_runId, onEvent) => {
      pushed = onEvent;
      return () => undefined;
    });

    renderWithProviders(<TasksTab />);
    await user.type(screen.getByPlaceholderText(/描述一个任务/), 'task X');
    await user.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(mStream).toHaveBeenCalled());

    // 工具调用 + 结果(思考过程展开中)
    act(() => {
      pushed?.(runEventFixtures.toolCalled);
      pushed?.(runEventFixtures.toolResult);
    });
    expect(await screen.findByText(/retrieve_knowledge/)).toBeInTheDocument();
    expect(screen.getByText(/hits: 3 chunks/)).toBeInTheDocument();

    // 最终答案(payload.content)
    act(() => { pushed?.(runEventFixtures.finalAnswer); });
    expect(await screen.findByText('done summary')).toBeInTheDocument();
  });

  it('空 task 提交无副作用', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TasksTab />);
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(mSubmit).not.toHaveBeenCalled();
  });
});
