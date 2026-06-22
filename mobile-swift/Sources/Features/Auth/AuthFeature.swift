import ComposableArchitecture
import Foundation

@Reducer
struct AuthFeature {
    @ObservableState
    struct State: Equatable {
        var username = ""
        var password = ""
        var isLoading = false
        var errorMessage: String?

        var isLoginEnabled: Bool {
            !username.isEmpty && !password.isEmpty && !isLoading
        }
    }

    enum Action: BindableAction, Equatable {
        case binding(BindingAction<State>)
        case loginButtonTapped
        case loginSucceeded(AuthTokens)
        case loginFailed(message: String)
        case delegate(Delegate)

        enum Delegate: Equatable {
            case loggedIn(AuthTokens)
        }
    }

    @Dependency(\.authService) var authService

    var body: some ReducerOf<Self> {
        BindingReducer()
        Reduce { state, action in
            switch action {
            case .binding:
                state.errorMessage = nil
                return .none

            case .loginButtonTapped:
                guard state.isLoginEnabled else { return .none }
                state.isLoading = true
                state.errorMessage = nil
                let username = state.username
                let password = state.password
                return .run { send in
                    do {
                        let tokens = try await authService.login(
                            username: username,
                            password: password,
                            remember: true
                        )
                        await send(.loginSucceeded(tokens))
                    } catch {
                        await send(.loginFailed(message: loginErrorMessage(error)))
                    }
                }

            case let .loginSucceeded(tokens):
                state.isLoading = false
                return .send(.delegate(.loggedIn(tokens)))

            case let .loginFailed(message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .delegate:
                return .none
            }
        }
    }
}

private func loginErrorMessage(_ error: Error) -> String {
    if let apiError = error as? APIError, case .unauthorized = apiError {
        return "用户名或密码错误"
    }
    return "登录失败,请稍后重试"
}
