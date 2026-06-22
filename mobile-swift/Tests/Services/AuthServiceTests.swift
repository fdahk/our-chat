import Dependencies
import Foundation
import Testing
@testable import OurChat

struct AuthServiceTests {
    @Test
    func loginStoresTokens() async throws {
        let keychain = KeychainStore.inMemory()
        try await withDependencies {
            $0.apiClient.perform = { _ in Data(#"{"accessToken":"at","refreshToken":"rt"}"#.utf8) }
            $0.keychain = keychain
        } operation: {
            let tokens = try await AuthService.liveValue.login(username: "u", password: "p", remember: false)
            #expect(tokens == AuthTokens(accessToken: "at", refreshToken: "rt"))
            #expect(try keychain.load(.accessToken) == "at")
            #expect(try keychain.load(.refreshToken) == "rt")
        }
    }

    @Test
    func refreshUpdatesStoredTokens() async throws {
        let keychain = KeychainStore.inMemory()
        try keychain.save("old-rt", .refreshToken)
        try await withDependencies {
            $0.apiClient.perform = { _ in Data(#"{"accessToken":"new-at","refreshToken":"new-rt"}"#.utf8) }
            $0.keychain = keychain
        } operation: {
            let tokens = try await AuthService.liveValue.refresh()
            #expect(tokens == AuthTokens(accessToken: "new-at", refreshToken: "new-rt"))
            #expect(try keychain.load(.accessToken) == "new-at")
            #expect(try keychain.load(.refreshToken) == "new-rt")
        }
    }

    @Test
    func refreshThrowsWhenNoRefreshTokenStored() async {
        let keychain = KeychainStore.inMemory()
        await withDependencies {
            $0.keychain = keychain
        } operation: {
            await #expect(throws: AuthError.notAuthenticated) {
                _ = try await AuthService.liveValue.refresh()
            }
        }
    }

    @Test
    func logoutClearsTokens() async throws {
        let keychain = KeychainStore.inMemory()
        try keychain.save("at", .accessToken)
        try keychain.save("rt", .refreshToken)
        try await withDependencies {
            $0.keychain = keychain
        } operation: {
            try await AuthService.liveValue.logout()
            #expect(try keychain.load(.accessToken) == nil)
            #expect(try keychain.load(.refreshToken) == nil)
        }
    }
}
