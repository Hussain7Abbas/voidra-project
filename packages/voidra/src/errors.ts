export interface Diagnostic {
  code: string;
  file: string;
  field: string;
  line: number;
  message: string;
}

export class VoidraError extends Error implements Diagnostic {
  code: string;
  file: string;
  field: string;
  line: number;
  constructor(
    code: string,
    file: string,
    message: string,
    field = "$",
    line = 1,
  ) {
    super(message);
    this.name = "VoidraError";
    this.code = code;
    this.file = file;
    this.field = field;
    this.line = line;
  }
  diagnostic(): Diagnostic {
    return {
      code: this.code,
      file: this.file,
      field: this.field,
      line: this.line,
      message: this.message,
    };
  }
}
