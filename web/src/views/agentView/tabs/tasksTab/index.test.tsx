// TasksTab 测试。覆盖:empty 态 / 提交 / 事件流时间线展示。
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

  it('提交任务 → 调 submitAgentTask + 订阅 streamRun', async () => {
    const user = userEvent.setup();
    mSubmit.mockResolvedValue(agentTaskRespFixture);
    mStream.mockReturnValue(() => undefined);

    renderWithProviders(<TasksTab />);
    const ta = screen.getByPlaceholderText(/描述一个任务/);
    await user.type(ta, 'summarize my docs');
    await user.click(screen.getByRole('button', { name: '提交任务' }));

    await waitFor(() => expect(mSubmit).toHaveBeenCalledWith('summarize my docs'));
    expect(mStream).toHaveBeenCalledWith(
      agentTaskRespFixture.runId, expect.any(Function), expect.any(Function),
    );

    // 任务条目出现 + runId 前 8 位
    expect(await screen.findByText('summarize my docs')).toBeInTheDocument();
    expect(screen.getByText(agentTaskRespFixture.runId.slice(0, 8))).toBeInTheDocument();
  });

  it('streamRun 推 final_answer 时事件出现在时间线上', async () => {
    const user = userEvent.setup();
    mSubmit.mockResolvedValue({ runId: 'r1' });
    let pushed: ((e: RunEvent) => void) | null = null;
    mStream.mockImplementation((_runId, onEvent) => {
      pushed = onEvent;
      return () => undefined;
    });

    renderWithProviders(<TasksTab />);
    await user.type(screen.getByPlaceholderText(/描述一个任务/), 'task X');
    await user.click(screen.getByRole('button', { name: '提交任务' }));

    await waitFor(() => expect(mStream).toHaveBeenCalled());

    // 手动推三个事件(用 fixture 派生,id 类型对齐为 string)
    act(() => {
      pushed?.(runEventFixtures.toolCalled);
      pushed?.(runEventFixtures.toolResult);
      pushed?.(runEventFixtures.finalAnswer);
    });

    expect(await screen.findByText('tool_called')).toBeInTheDocument();
    expect(screen.getByText('tool_result')).toBeInTheDocument();
    expect(screen.getByText('final_answer')).toBeInTheDocument();
    // payload 渲染(具体内容来自 fixture)
    expect(screen.getByText(/retrieve_knowledge/)).toBeInTheDocument();
    expect(screen.getByText(/done summary/)).toBeInTheDocument();
  });

  it('空 task 提交无副作用', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TasksTab />);
    await user.click(screen.getByRole('button', { name: '提交任务' }));
    expect(mSubmit).not.toHaveBeenCalled();
  });
});
