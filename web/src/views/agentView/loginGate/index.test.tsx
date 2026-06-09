// LoginGate 组件测试。覆盖:
//   - 初次渲染登录态
//   - 切到注册态后 displayName 输入框出现
//   - 表单提交调 agentLogin,onLogin 回调拿到 user(用 fixture 派生)
//   - 注册模式先调 agentRegister(三参) 再 agentLogin
//   - 客户端校验:用户名非法 / 密码 < 8 / 注册时 displayName 空 → 不触发 API
//   - API 失败显 toast + onLogin 不调用

import { describe, expect, it, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '@/test/render';

vi.mock('../api', () => ({
  agentLogin: vi.fn(),
  agentRegister: vi.fn(),
}));

import LoginGate from './index';
import { agentLogin, agentRegister } from '../api';
import { authLoginRespFixture } from '../__fixtures__/agentServer';

const mockedLogin    = vi.mocked(agentLogin);
const mockedRegister = vi.mocked(agentRegister);

beforeEach(() => {
  mockedLogin.mockReset();
  mockedRegister.mockReset();
});

function renderGate() {
  const onLogin = vi.fn();
  renderWithProviders(<LoginGate onLogin={onLogin} />);
  return { onLogin };
}

describe('<LoginGate>', () => {
  it('默认登录态:无 displayName 输入', () => {
    renderGate();
    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.queryByLabelText('显示名')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('切到注册态:displayName 输入框出现', async () => {
    const user = userEvent.setup();
    renderGate();
    await user.click(screen.getByRole('button', { name: /没账号/ }));
    expect(screen.getByRole('button', { name: '注册并登录' })).toBeInTheDocument();
    expect(screen.getByLabelText('显示名')).toBeInTheDocument();
  });

  it('客户端校验:空表单提交不触发 API', async () => {
    const user = userEvent.setup();
    const { onLogin } = renderGate();
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(mockedLogin).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('客户端校验:密码 < 8 字符拦截,不调 agentLogin', async () => {
    const user = userEvent.setup();
    const { onLogin } = renderGate();
    await user.type(screen.getByLabelText('用户名'), 'alice');
    await user.type(screen.getByLabelText('密码'), '1234567'); // 7 个
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(mockedLogin).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
    expect(await screen.findByText(/密码 8-128/)).toBeInTheDocument();
  });

  it('客户端校验:用户名含中文被拦截', async () => {
    const user = userEvent.setup();
    const { onLogin } = renderGate();
    await user.type(screen.getByLabelText('用户名'), '中文用户');
    await user.type(screen.getByLabelText('密码'), '12345678');
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(mockedLogin).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('登录态:填表 + 提交 → 调 agentLogin + onLogin 回传 user', async () => {
    const user = userEvent.setup();
    mockedLogin.mockResolvedValue(authLoginRespFixture);

    const { onLogin } = renderGate();
    await user.type(screen.getByLabelText('用户名'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'Secret12');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(mockedLogin).toHaveBeenCalledWith('alice', 'Secret12'));
    expect(mockedRegister).not.toHaveBeenCalled();
    expect(onLogin).toHaveBeenCalledWith({
      username: authLoginRespFixture.user.username,
      displayName: authLoginRespFixture.user.displayName,
    });
  });

  it('注册态:三参 agentRegister(username, password, displayName) 后再 agentLogin', async () => {
    const user = userEvent.setup();
    mockedRegister.mockResolvedValue(authLoginRespFixture);
    mockedLogin.mockResolvedValue(authLoginRespFixture);

    const { onLogin } = renderGate();
    await user.click(screen.getByRole('button', { name: /没账号/ }));
    await user.type(screen.getByLabelText('用户名'), 'bob');
    await user.type(screen.getByLabelText('密码'), 'Secret12');
    await user.type(screen.getByLabelText('显示名'), '鲍勃');
    await user.click(screen.getByRole('button', { name: '注册并登录' }));

    await waitFor(() => expect(mockedRegister).toHaveBeenCalledWith('bob', 'Secret12', '鲍勃'));
    expect(mockedLogin).toHaveBeenCalledWith('bob', 'Secret12');
    expect(onLogin).toHaveBeenCalled();
  });

  it('注册态:漏填 displayName 不调任何 API', async () => {
    const user = userEvent.setup();
    const { onLogin } = renderGate();
    await user.click(screen.getByRole('button', { name: /没账号/ }));
    await user.type(screen.getByLabelText('用户名'), 'bob');
    await user.type(screen.getByLabelText('密码'), 'Secret12');
    await user.click(screen.getByRole('button', { name: '注册并登录' }));
    expect(mockedRegister).not.toHaveBeenCalled();
    expect(mockedLogin).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('API 抛错:onLogin 不调用', async () => {
    const user = userEvent.setup();
    mockedLogin.mockRejectedValue(new Error('bad credentials'));

    const { onLogin } = renderGate();
    await user.type(screen.getByLabelText('用户名'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'Secret12');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(mockedLogin).toHaveBeenCalled());
    expect(onLogin).not.toHaveBeenCalled();
  });
});
