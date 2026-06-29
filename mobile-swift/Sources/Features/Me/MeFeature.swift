import ComposableArchitecture
import Foundation

@Reducer
struct MeFeature {
    @ObservableState
    struct State: Equatable {
        var profile = MeProfile.empty
        var settingsPresented = false
    }

    enum Action: BindableAction {
        case binding(BindingAction<State>)
        case onAppear
        case profileResponse(MeProfile)
        case settingsTapped
        case logoutTapped
        case delegate(Delegate)

        enum Delegate: Equatable {
            case logout
        }
    }

    @Dependency(\.meClient) var meClient

    var body: some ReducerOf<Self> {
        BindingReducer()
        Reduce { state, action in
            switch action {
            case .onAppear:
                return .run { send in
                    let profile = try await meClient.profile()
                    await send(.profileResponse(profile))
                } catch: { _, _ in
                    // 拉取失败保持空态,不打断「我」页其余入口。
                }

            case let .profileResponse(profile):
                state.profile = profile
                return .none

            case .settingsTapped:
                state.settingsPresented = true
                return .none

            case .logoutTapped:
                return .send(.delegate(.logout))

            case .binding, .delegate:
                return .none
            }
        }
    }
}

struct MeProfile: Equatable, Sendable {
    var name: String
    var wxid: String
    var avatarURL: URL?
    var friendCount: Int
}

extension MeProfile {
    static let empty = MeProfile(name: "", wxid: "", avatarURL: nil, friendCount: 0)

    static let sample = MeProfile(
        name: "段宇皓",
        wxid: "1024",
        avatarURL: nil,
        friendCount: 6
    )
}
