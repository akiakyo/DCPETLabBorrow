<?php
// shared by register, users and my account
function read_user_form(): array
{
    return [
        'school_id' => input('school_id'),
        'full_name' => input('full_name'),
        'email' => strtolower(input('email')),
        'borrower_type' => input('borrower_type', 'Student'),
        'role' => input('role', 'user'),
        'is_active' => isset($_POST['is_active']) ? 1 : 0,
        'password' => (string) ($_POST['password'] ?? ''),
        'password_confirm' => (string) ($_POST['password_confirm'] ?? ''),
    ];
}

function validate_user_form(array $d, ?int $ignoreId, bool $passwordRequired): array
{
    $errors = [];
    if (!preg_match('/^[A-Za-z0-9-]{3,20}$/', $d['school_id'])) {
        $errors['school_id'] = 'Use 3–20 letters, numbers or dashes, like 2024-00123.';
    } elseif (db_value('SELECT COUNT(*) FROM users WHERE school_id = ? AND id <> ?', [$d['school_id'], $ignoreId ?? 0])) {
        $errors['school_id'] = 'This ID number already has an account.';
    }
    if (mb_strlen($d['full_name']) < 2 || mb_strlen($d['full_name']) > 100) {
        $errors['full_name'] = 'Enter a full name (2–100 characters).';
    }
    if (!filter_var($d['email'], FILTER_VALIDATE_EMAIL)) {
        $errors['email'] = 'Enter a valid email address.';
    } elseif (db_value('SELECT COUNT(*) FROM users WHERE email = ? AND id <> ?', [$d['email'], $ignoreId ?? 0])) {
        $errors['email'] = 'This email already has an account.';
    }
    if (!in_array($d['borrower_type'], BORROWER_TYPES, true)) {
        $errors['borrower_type'] = 'Choose a borrower type.';
    }
    if (!array_key_exists($d['role'], ROLE_LABELS)) {
        $errors['role'] = 'Choose a role.';
    }
    if ($passwordRequired || $d['password'] !== '') {
        if (strlen($d['password']) < 8) {
            $errors['password'] = 'Use at least 8 characters.';
        } elseif ($d['password'] !== $d['password_confirm']) {
            $errors['password_confirm'] = 'The passwords don’t match.';
        }
    }
    return $errors;
}

function field_error(array $errors, string $name): string
{
    return '<p class="error" id="' . e($name) . '-error">' . e($errors[$name] ?? '') . '</p>';
}

function invalid_attr(array $errors, string $name): string
{
    return isset($errors[$name]) ? ' aria-invalid="true" aria-describedby="' . e($name) . '-error"' : '';
}
