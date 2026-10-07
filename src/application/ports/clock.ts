/** The only way to read the current time; `domain` functions take it as `now`. */
export interface Clock {
  now(): Date;
}
