import ComposableArchitecture
import Kingfisher
import PhotosUI
import SwiftUI

struct ChatDetailView: View {
    @Bindable var store: StoreOf<ChatDetailFeature>
    @State private var photoItem: PhotosPickerItem?

    var body: some View {
        VStack(spacing: 0) {
            messageList
            inputBar
        }
        .background(WeChatColor.background)
        .navigationTitle(store.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(WeChatColor.navBar, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .task { store.send(.onAppear) }
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(store.messages) { message in
                        MessageBubble(message: message, isMine: message.senderId == store.currentUserId)
                            .id(message.id)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: store.messages.count) {
                guard let last = store.messages.last else { return }
                withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
            }
        }
    }

    private var inputBar: some View {
        HStack(spacing: 10) {
            PhotosPicker(selection: $photoItem, matching: .images) {
                Image(systemName: "photo.on.rectangle")
                    .font(.system(size: 22))
                    .foregroundStyle(WeChatColor.textSecondary)
            }
            .onChange(of: photoItem) { _, newItem in
                guard let newItem else { return }
                Task {
                    if let data = try? await newItem.loadTransferable(type: Data.self) {
                        store.send(.imageSelected(data))
                    }
                    photoItem = nil
                }
            }
            TextField("", text: $store.draft)
                .textFieldStyle(.plain)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(WeChatColor.elevated, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                .foregroundStyle(WeChatColor.textPrimary)
                .submitLabel(.send)
                .onSubmit { store.send(.sendButtonTapped) }
            Button { store.send(.sendButtonTapped) } label: {
                Text("发送")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(WeChatColor.brand, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            .disabled(store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(WeChatColor.navBar)
    }
}

// 消息气泡:我方右对齐微信绿,对方左对齐深色卡片。
private struct MessageBubble: View {
    let message: ChatMessage
    let isMine: Bool

    var body: some View {
        HStack {
            if isMine { Spacer(minLength: 48) }
            bubble
            if !isMine { Spacer(minLength: 48) }
        }
    }

    @ViewBuilder private var bubble: some View {
        if message.type == "image", let url = URL(string: message.content) {
            KFImage(url)
                .resizable()
                .scaledToFill()
                .frame(maxWidth: 180, maxHeight: 240)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        } else {
            Text(message.content)
                .font(.system(size: 16))
                .foregroundStyle(isMine ? Color(hex: 0x111111) : WeChatColor.textPrimary)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(
                    isMine ? WeChatColor.brand : WeChatColor.elevated,
                    in: RoundedRectangle(cornerRadius: 6, style: .continuous)
                )
        }
    }
}

#Preview {
    NavigationStack {
        ChatDetailView(
            store: Store(
                initialState: ChatDetailFeature.State(conversationId: "single_1_2", title: "段宇皓", currentUserId: 1)
            ) {
                ChatDetailFeature()
            } withDependencies: {
                $0.chatClient.messages = { _ in MessageSamples.all }
                $0.socketClient = .previewValue
            }
        )
    }
    .preferredColorScheme(.dark)
}
