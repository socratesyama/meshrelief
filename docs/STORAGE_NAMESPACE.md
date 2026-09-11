# Storage namespace

この配布物は IndexedDB を `meshrelief:public:v2` として分離する。同一originの別profileとidentity・秘密鍵・PIIを共有しない。schema version変更時は別namespaceを開き、旧DBを暗黙に読み込まない。
