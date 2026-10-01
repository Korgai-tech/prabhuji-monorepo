import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';

class UsersScreen extends ConsumerStatefulWidget {
  const UsersScreen({super.key});
  @override
  ConsumerState<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends ConsumerState<UsersScreen> {
  final _email = TextEditingController();
  final _name = TextEditingController();
  final _password = TextEditingController();
  String? _error;

  Future<void> _create() async {
    setState(() => _error = null);
    try {
      await createUser(
        ref,
        email: _email.text,
        name: _name.text,
        password: _password.text,
      );
      if (!mounted) return;
      _email.clear();
      _name.clear();
      _password.clear();
    } catch (_) {
      if (mounted) setState(() => _error = 'Failed to create user');
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _name.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final users = ref.watch(usersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Users')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                TextField(
                  controller: _email,
                  decoration: const InputDecoration(hintText: 'Email'),
                ),
                TextField(
                  controller: _name,
                  decoration: const InputDecoration(hintText: 'Name'),
                ),
                TextField(
                  controller: _password,
                  obscureText: true,
                  decoration: const InputDecoration(hintText: 'Password'),
                ),
                if (_error != null)
                  Text(_error!, style: const TextStyle(color: Colors.red)),
                ElevatedButton(
                  onPressed: () => unawaited(_create()),
                  child: const Text('Create'),
                ),
              ],
            ),
          ),
          Expanded(
            child: users.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (list) => ListView(
                children: [
                  for (final u in list)
                    // Null for phone accounts, which have no email — this
                    // debug list is the email-login (CMS) view.
                    ListTile(title: Text(u.email ?? '—'), subtitle: Text(u.id)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
