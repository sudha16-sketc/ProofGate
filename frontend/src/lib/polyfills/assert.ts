const assert: (value: unknown, message?: string | Error) => asserts value = (
  value,
  message,
) => {
  if (!value) {
    throw message instanceof Error
      ? message
      : new Error(typeof message === 'string' ? message : 'Assertion failed');
  }
};

export default assert;
