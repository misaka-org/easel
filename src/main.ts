import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";

const inverse = (n: number): O.Option<number> =>
  n === 0 ? O.none : O.some(1 / n);

const result = pipe(
  inverse(2),
  O.map((n) => n * 100),
  O.getOrElse(() => 0)
);

console.log(result); // 50
