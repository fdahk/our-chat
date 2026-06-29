import ComposableArchitecture
import SwiftUI

struct LoginView: View {
    @Bindable var store: StoreOf<AuthFeature>

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            header
            fields
            errorLabel
            loginButton
            Spacer()
        }
        .padding(.horizontal, 32)
        .background(Color(.systemBackground))
    }

    private var header: some View {
        VStack(spacing: 12) {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
            Text("OurChat")
                .font(.largeTitle.weight(.bold))
            Text("登录以继续")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var fields: some View {
        VStack(spacing: 16) {
            TextField("用户名", text: $store.username)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            SecureField("密码", text: $store.password)
                .textContentType(.password)
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    @ViewBuilder
    private var errorLabel: some View {
        if let message = store.errorMessage {
            Text(message)
                .font(.footnote)
                .foregroundStyle(.red)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var loginButton: some View {
        Button {
            store.send(.loginButtonTapped)
        } label: {
            Group {
                if store.isLoading {
                    ProgressView().tint(.white)
                } else {
                    Text("登录").font(.headline)
                }
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(store.isLoginEnabled ? Color.accentColor : Color.gray.opacity(0.4))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .disabled(!store.isLoginEnabled)
    }
}

#Preview {
    LoginView(
        store: Store(initialState: AuthFeature.State()) {
            AuthFeature()
        }
    )
}
