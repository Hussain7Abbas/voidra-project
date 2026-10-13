// AGPL-3.0-or-later. Read-only macOS process identity for sandboxed agents.
#include <errno.h>
#include <inttypes.h>
#include <libproc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/proc_info.h>
#ifndef VOIDRA_SOURCE_HASH
#define VOIDRA_SOURCE_HASH "unbuilt"
#endif
static void json_string(const char *value) {
  putchar('"');
  for (const unsigned char *p = (const unsigned char *)value; *p; p++) {
    if (*p == '"' || *p == '\\') { putchar('\\'); putchar(*p); }
    else if (*p < 32) printf("\\u%04x", *p);
    else putchar(*p);
  }
  putchar('"');
}
int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--source-hash") == 0) {
    puts(VOIDRA_SOURCE_HASH); return 0;
  }
  if (argc != 2) return 2;
  char *end = NULL;
  long value = strtol(argv[1], &end, 10);
  if (!end || *end || value < 1 || value > INT32_MAX) return 2;
  struct proc_bsdinfo info = {0};
  int size = proc_pidinfo((int)value, PROC_PIDTBSDINFO, 0, &info, sizeof(info));
  if (size != (int)sizeof(info)) {
    if (errno == ESRCH || errno == ENOENT || (size == 0 && errno == 0)) { puts("null"); return 0; }
    perror("proc_pidinfo"); return 1;
  }
  char identity[80];
  snprintf(identity, sizeof(identity), "macos:%" PRIu64 ":%" PRIu64,
           info.pbi_start_tvsec, info.pbi_start_tvusec);
  char path[PROC_PIDPATHINFO_MAXSIZE] = {0};
  const char *command = info.pbi_comm;
  if (proc_pidpath((int)value, path, sizeof(path)) > 0) {
    const char *slash = strrchr(path, '/');
    command = slash ? slash + 1 : path;
  }
  printf("{\"pid\":%u,\"parentPid\":%u,\"identity\":", info.pbi_pid, info.pbi_ppid);
  json_string(identity); printf(",\"command\":"); json_string(command); puts("}");
  return 0;
}
