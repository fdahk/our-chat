import ComposableArchitecture
import Foundation

// 搜索:输入微信号/手机号/用户名,防抖后精确查找用户。命中显示用户,未命中提示。
@Reducer
struct SearchFeature {
    @ObservableState
    struct State: Equatable {
        var query = ""
        var result: SearchResult?
        var isSearching = false
        var notFound = false
    }

    enum Action: BindableAction {
        case binding(BindingAction<State>)
        case searchResponse(SearchResult?)
        case closeTapped
        case delegate(Delegate)

        enum Delegate: Equatable {
            case close
        }
    }

    @Dependency(\.searchClient) var searchClient
    @Dependency(\.continuousClock) var clock

    private enum CancelID { case search }

    var body: some ReducerOf<Self> {
        BindingReducer()
        Reduce { state, action in
            switch action {
            case .binding(\.query):
                let keyword = state.query.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !keyword.isEmpty else {
                    state.result = nil
                    state.notFound = false
                    state.isSearching = false
                    return .cancel(id: CancelID.search)
                }
                state.isSearching = true
                state.notFound = false
                return .run { send in
                    try await clock.sleep(for: .milliseconds(300)) // 防抖:连续输入只查最后一次
                    let result = try await searchClient.search(keyword)
                    await send(.searchResponse(result))
                } catch: { _, send in
                    await send(.searchResponse(nil))
                }
                .cancellable(id: CancelID.search, cancelInFlight: true)

            case let .searchResponse(result):
                state.isSearching = false
                state.result = result
                state.notFound = result == nil
                return .none

            case .closeTapped:
                return .send(.delegate(.close))

            case .binding, .delegate:
                return .none
            }
        }
    }
}
