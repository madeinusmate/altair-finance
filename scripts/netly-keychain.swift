import Foundation
import Security

let args = CommandLine.arguments
guard args.count >= 4 else {
  fputs("usage: netly-keychain write|read|delete account service\n", stderr)
  exit(2)
}

let action = args[1]
let account = args[2]
let service = args[3]

let base: [String: Any] = [
  kSecClass as String: kSecClassGenericPassword,
  kSecAttrAccount as String: account,
  kSecAttrService as String: service,
]

if action == "delete" {
  SecItemDelete(base as CFDictionary)
  exit(0)
}

if action == "read" {
  var query = base
  query[kSecReturnData as String] = true
  query[kSecMatchLimit as String] = kSecMatchLimitOne
  var item: CFTypeRef?
  let status = SecItemCopyMatching(query as CFDictionary, &item)
  if status != errSecSuccess {
    exit(1)
  }
  if let data = item as? Data {
    FileHandle.standardOutput.write(data)
  }
  exit(0)
}

if action == "write" {
  let data = FileHandle.standardInput.readDataToEndOfFile()
  if data.isEmpty {
    fputs("missing secret\n", stderr)
    exit(1)
  }
  SecItemDelete(base as CFDictionary)
  var add = base
  add[kSecValueData as String] = data
  let status = SecItemAdd(add as CFDictionary, nil)
  exit(status == errSecSuccess ? 0 : 1)
}

exit(2)
