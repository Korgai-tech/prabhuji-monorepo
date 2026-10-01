import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../state/providers.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  String? _error;

  Future<void> _submit() async {
    setState(() => _error = null);
    try {
      final token = await ref.read(apiClientProvider).login(_email.text, _password.text);
      // `authStore.write` broadcasts on `store.changes`; the analytics
      // subscription in main() picks that up and calls `signIn(token)`, and
      // the router refresh listener picks it up too. No parallel state to
      // update here — the store is the bus.
      await ref.read(authStoreProvider).write(token);
      if (mounted) context.go('/users');
    } catch (e) {
      if (mounted) setState(() => _error = _messageFor(e));
    }
  }

  /// A genuine 401 is bad credentials; anything else (no response, a
  /// connection/timeout, or a non-401 status) is a connectivity/server problem.
  static String _messageFor(Object error) {
    if (error is DioException && error.response?.statusCode == 401) {
      return 'Invalid credentials';
    }
    return 'Unable to reach the server. Please try again.';
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Text('Admin login', style: TextStyle(fontSize: 20)),
            TextField(controller: _email, decoration: const InputDecoration(hintText: 'Email')),
            TextField(controller: _password, obscureText: true, decoration: const InputDecoration(hintText: 'Password')),
            if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
            ElevatedButton(
              onPressed: () {
                unawaited(ref.read(analyticsProvider)?.trackClick('login', 'sign-in-button'));
                unawaited(_submit());
              },
              child: const Text('Sign in'),
            ),
          ]),
        ),
      );
}
