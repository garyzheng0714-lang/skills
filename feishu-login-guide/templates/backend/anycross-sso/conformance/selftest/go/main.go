// 自测用的最小 Go 项目：照 README 的接法挂上模板，供 selftest.sh 跑合规测试。
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"selftest/internal/auth"
)

func main() {
	store, err := auth.NewFileStore(filepath.Join(os.Getenv("CONFORMANCE_DATA_DIR"), "sso.json"))
	if err != nil {
		log.Fatal(err)
	}
	sso, err := auth.New(context.Background(), auth.Options{
		Store:    store,
		OnLogin:  func(ctx context.Context, id auth.Identity) (string, error) { return id.Key(), nil },
		Features: []auth.Feature{{Key: "export", Column: "导出"}},
	})
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	sso.Register(mux)
	mux.Handle("GET /api/export", sso.RequireUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("export for " + auth.CurrentUser(r).ID))
	})))
	mux.Handle("GET /api/export-sheet", sso.RequireUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !auth.HasFeature(r, "export") {
			http.Error(w, `{"error":"feature_required"}`, http.StatusForbidden)
			return
		}
		w.Write([]byte("sheet"))
	})))
	mux.Handle("GET /api/sensitive", sso.RequireFreshUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})))
	// 下载要留痕：调 Audit，成功的 GET 也记进日志。
	mux.Handle("GET /api/download", sso.RequireUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth.Audit(r)
		w.Write([]byte("file"))
	})))
	// 合规测试用来看 5xx 有没有记进日志。
	mux.HandleFunc("GET /api/boom", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	})
	srv := &http.Server{Addr: "127.0.0.1:" + os.Getenv("PORT"), Handler: sso.Middleware(mux)}
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()
	// 收到 SIGTERM：先停接新请求，再把待写队列落盘，重启后接着写。
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()
	done, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(done)
	_ = sso.Shutdown(done)
}
