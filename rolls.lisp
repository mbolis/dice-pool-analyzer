(defparameter *args* (or
		#+CLISP *args*
		#+SBCL *posix-argv*  
		#+LISPWORKS system:*line-arguments-list*
		#+CMU extensions:*command-line-words*
		nil))

(defparameter *roll-power* (parse-integer (or (nth 1 *args*) "100000000")))
(format t "~a~%" *roll-power*)

(defun combine (pool-size class)
  (labels ((combine (buffer accum)
	     (if (= pool-size (length buffer))
		 (let ((first (first buffer)))
		   (if (= class first)
		       (reverse accum)
		       (let ((buffer (cons (1+ first) (remove first buffer))))
			 (combine buffer (cons buffer accum)))))
		 (let ((buffer (cons 1 buffer)))
		   (combine buffer (cons buffer accum))))))
    (combine nil nil)))

(defun rep (n x) (make-list n :initial-element x))
(defparameter *dice* (list
		      :_ (rep 6 :niente)
		      :B (append '((:scudo))
				 (rep 2 '(:colpito))
				 '((:speciale))
				 (rep 2 nil))
		      :R (append (rep 2 '(:scudo))
				 (rep 3 '(:colpito))
				 '((:speciale)))
		      :N (append '((:scudo))
				 (rep 2 '(:colpito))
				 (rep 2 '(:scudo :colpito))
				 '((:speciale)))))

(defvar *pools*)
(setf *pools* (combine 6 3))

(defun get-dice-names (pool-indices)
  (mapcar #'(lambda (i) (elt *dice* (* 2 i))) pool-indices))
(defun make-dice-pool (pool-indices)
  (mapcar #'(lambda (i) (elt *dice* (1+ (* 2 i)))) pool-indices))

(defun roll (die)
  (nth (random (length die)) die))
(defun rolled-values (dice-rolls)
  (apply #'append nil dice-rolls))
(defun roll-dice (dice)
  (rolled-values (mapcar #'roll dice)))

(defun all-values ()
  (loop
     for (key . rest) = *dice* then (cdr rest)
     for values = (rolled-values (car rest))
     when (null rest) do (return (remove-duplicates all-values))
     append values into all-values))

(defvar *all-values* (all-values))

(defparameter *test-cases* (loop
			      for value in *all-values*
			      nconc (loop
				       for x from 1 upto 6
				       nconc (list (list value x #'=)
						   (list value x #'>=)))))
			      

(defun verify-test (test-case rolled-values)
  "Return T if TEST-CASE holds for the list of ROLLED-VALUES."
  (destructuring-bind (value thresh check) test-case
    (funcall check (count value rolled-values) thresh)))
(defun collect-verified-tests (rolled-values)
  (loop
     for test-case in *test-cases*
     if (verify-test test-case rolled-values)
     collect test-case))
(defun update-roll-analysis (rolled-values analysis)
  (flet ((update-test-analysis (test-case)
	   (incf (gethash test-case analysis 0))))
    (mapc #'update-test-analysis (collect-verified-tests rolled-values)))
  analysis)
(defun analyze-dice-rolls (dice repeats)
  (let ((analysis (make-hash-table :test #'equal)))
    (dotimes (i repeats)
      (update-roll-analysis (roll-dice dice) analysis))
    analysis))
(defun update-general-analysis (dice-names roll-analysis general-analysis)
  (flet ((copy-test-analysis (test-case favorable-cases)
	   (let ((keyed-test-case (cons dice-names test-case)))
	   (setf (gethash keyed-test-case general-analysis) favorable-cases))))
    (maphash #'copy-test-analysis roll-analysis))
  general-analysis)
(defun analyze-pool (pool-indices)
  (let* ((dice (make-dice-pool pool-indices))
	(dice-analysis (analyze-dice-rolls dice *roll-power*)))
    (flet ((test-case-entry (test-case)
	     (list (cons pool-indices test-case)
		   (gethash test-case dice-analysis 0))))
      (mapcar #'test-case-entry *test-cases*))))
(defun run-analysis (pools)
  (loop
     for pool in pools
     nconc (analyze-pool pool)))

(setf lparallel:*kernel* (lparallel:make-kernel 4))
(defun run-analysis-mp (pools)
  (reduce #'append (lparallel:pmapcar #'analyze-pool :parts 8 pools)))

(defun list-to-string (list)
  (apply #'concatenate 'string (mapcar #'princ-to-string list)))
(defun pool-name (pool)
  (labels ((extract (pool accum)
	     (if (null pool)
		 (list-to-string (butlast accum))
		 (let* ((first (first pool))
			(count (count first pool)))
		   (extract (nthcdr count pool) (nconc accum (list count first #\+)))))))
    (extract (get-dice-names pool) nil)))
(defun target-name (thresh check-fn)
  (if (eq check-fn #'>=)
      (format nil "~d+" thresh)
      (format nil "~d" thresh)))
(defun make-analysis-report (analysis-data)
  (flet ((entry-to-string (analysis-entry)
	   (destructuring-bind ((pool value thresh check-fn) favorable-values) analysis-entry
	     (format nil "~a,~a,~a,~a"
		     (pool-name pool)
		     value
		     (target-name thresh check-fn)
		     favorable-values)))
	 (sort-entries (entry1 entry2)
	   (destructuring-bind (((pool1 value1 thresh1 check-fn1) nil)
				((pool2 value2 thresh2 check-fn2) nil))
	       (list entry1 entry2)
	     (let ((i-pool-1 (position pool1 *pools*)) (i-value-1 (position value1 *all-values*))
		   (i-pool-2 (position pool2 *pools*)) (i-value-2 (position value2 *all-values*)))
	       (cond
		 ((< i-value-1 i-value-2) t)
		 ((= i-value-1 i-value-2)
		  (cond
		    ((and (eq check-fn1 #'>=) (eq check-fn2 #'=)) t)
		    ((eq check-fn1 check-fn2)
		     (cond
		       ((< i-pool-1 i-pool-2) t)
		       ((= i-pool-1 i-pool-2) (< thresh1 thresh2)))))))))))
    (mapcar #'entry-to-string (sort analysis-data #'sort-entries))))

(defun create-report (filename)
  (with-open-file (out filename 
		       :direction :output
		       :if-does-not-exist :create
		       :if-exists :overwrite)
    (format out "~{~a~%~}" (make-analysis-report (run-analysis-mp *pools*)))))
