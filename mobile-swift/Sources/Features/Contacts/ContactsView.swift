import ComposableArchitecture
import SwiftUI

struct ContactsView: View {
    @Bindable var store: StoreOf<ContactsFeature>

    private let specials: [SpecialEntry] = [
        SpecialEntry(title: "新的朋友", icon: "person.crop.circle.badge.plus", color: Color(hex: 0xFA9D3B)),
        SpecialEntry(title: "仅聊天的朋友", icon: "person.crop.circle", color: Color(hex: 0xFA9D3B)),
        SpecialEntry(title: "群聊", icon: "person.2.fill", color: WeChatColor.brand),
        SpecialEntry(title: "标签", icon: "tag.fill", color: Color(hex: 0x2782D7)),
        SpecialEntry(title: "公众号", icon: "book.fill", color: Color(hex: 0x2782D7)),
        SpecialEntry(title: "服务号", icon: "rhombus.fill", color: Color(hex: 0x2782D7)),
    ]

    private let indexTitles: [String] = ["↑", "☆"] + (UnicodeScalar("A").value ... UnicodeScalar("Z").value)
        .map { String(UnicodeScalar($0)!) } + ["#"]

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                List {
                    Section {
                        ForEach(Array(specials.enumerated()), id: \.element.id) { index, entry in
                            Group {
                                if index == 0 {
                                    // 第一项「新的朋友」可点进收发请求页。
                                    Button { store.send(.newFriendsTapped) } label: { SpecialRow(entry: entry) }
                                        .buttonStyle(.plain)
                                } else {
                                    SpecialRow(entry: entry)
                                }
                            }
                            .id(index == 0 ? "__top__" : entry.id.uuidString)
                            .listRowInsets(rowInsets)
                            .listRowBackground(WeChatColor.background)
                            .listRowSeparatorTint(WeChatColor.separator)
                            .alignmentGuide(.listRowSeparatorLeading) { _ in 52 }
                        }
                    }

                    Section {
                        SpecialRow(entry: SpecialEntry(
                            title: "企业微信联系人", icon: "bubble.left.fill", color: Color(hex: 0x2782D7)
                        ))
                        .listRowInsets(rowInsets)
                        .listRowBackground(WeChatColor.background)
                        .listRowSeparatorTint(WeChatColor.separator)
                        .alignmentGuide(.listRowSeparatorLeading) { _ in 52 }
                    } header: {
                        SectionHeader(title: "我的企业及企业联系人")
                    }

                    ForEach(store.contacts.groupedBySection(), id: \.key) { section in
                        Section {
                            ForEach(section.contacts) { contact in
                                ContactRow(contact: contact)
                                    .listRowInsets(rowInsets)
                                    .listRowBackground(WeChatColor.background)
                                    .listRowSeparatorTint(WeChatColor.separator)
                                    .alignmentGuide(.listRowSeparatorLeading) { _ in 52 }
                            }
                        } header: {
                            SectionHeader(title: section.key).id(section.key)
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(WeChatColor.background)
                .overlay(alignment: .trailing) {
                    IndexBar(titles: indexTitles) { title in
                        withAnimation {
                            proxy.scrollTo(scrollTarget(for: title), anchor: .top)
                        }
                    }
                }
            }
            .navigationTitle("通讯录")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(WeChatColor.navBar, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 22) {
                        Image(systemName: "magnifyingglass")
                        Image(systemName: "plus.circle")
                    }
                    .font(.system(size: 18))
                    .foregroundStyle(WeChatColor.textPrimary)
                }
            }
            .task { store.send(.onAppear) }
            .navigationDestination(item: $store.scope(state: \.newFriends, action: \.newFriends)) { newFriendsStore in
                NewFriendsView(store: newFriendsStore)
            }
        }
    }

    private var rowInsets: EdgeInsets { EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16) }

    private func scrollTarget(for indexTitle: String) -> String {
        indexTitle == "↑" || indexTitle == "☆" ? "__top__" : indexTitle
    }
}

private struct SpecialEntry: Identifiable, Equatable {
    let id = UUID()
    let title: String
    let icon: String
    let color: Color
}

private struct SpecialRow: View {
    let entry: SpecialEntry

    var body: some View {
        HStack(spacing: 12) {
            IconTile(systemName: entry.icon, color: entry.color, size: 40, cornerRadius: 6)
            Text(entry.title)
                .font(.system(size: 16))
                .foregroundStyle(WeChatColor.textPrimary)
            Spacer()
        }
        .padding(.vertical, 8)
    }
}

private struct ContactRow: View {
    let contact: Contact

    var body: some View {
        HStack(spacing: 12) {
            Avatar(url: contact.avatarURL, size: 40)
            Text(contact.name)
                .font(.system(size: 16))
                .foregroundStyle(WeChatColor.textPrimary)
                .lineLimit(1)
            Spacer()
        }
        .padding(.vertical, 8)
    }
}

private struct SectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.system(size: 13))
            .foregroundStyle(WeChatColor.textSecondary)
            .textCase(nil)
            .padding(.vertical, 2)
    }
}

private struct IndexBar: View {
    let titles: [String]
    let onSelect: (String) -> Void

    var body: some View {
        VStack(spacing: 1) {
            ForEach(titles, id: \.self) { title in
                Text(title)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(WeChatColor.textSecondary)
                    .frame(width: 18, height: 13)
                    .contentShape(Rectangle())
                    .onTapGesture { onSelect(title) }
            }
        }
        .padding(.trailing, 2)
    }
}

#Preview {
    ContactsView(
        store: Store(initialState: ContactsFeature.State()) {
            ContactsFeature()
        }
    )
    .preferredColorScheme(.dark)
}
